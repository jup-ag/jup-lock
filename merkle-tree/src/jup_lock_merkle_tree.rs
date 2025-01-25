use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{BufReader, Write},
    path::PathBuf,
    result,
};

use indexmap::IndexMap;
use merkle_verify::verify;
use serde::{Deserialize, Serialize};
use solana_program::{hash::hashv, pubkey::Pubkey};

use crate::{
    csv_entry::CsvEntry,
    error::MerkleTreeError::{self, MerkleValidationError},
    merkle_tree::MerkleTree,
    tree_node::TreeNode,
    utils::{get_proof, get_total_claim_amount},
};

// proof struct
#[derive(Serialize, Deserialize, Debug)]
pub struct UserProof {
    /// merkle tree that user belongs
    pub merkle_tree: String,
    // pub recipient: Pubkey,
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub cancel_mode: u8,
    /// proof
    pub proof: Vec<[u8; 32]>,
}

// We need to discern between leaf and intermediate nodes to prevent trivial second
// pre-image attacks.
// https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack
const LEAF_PREFIX: &[u8] = &[0];

/// Merkle Tree which will be used to distribute tokens to claimants.
/// Contains all the information necessary to verify claims against the Merkle Tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JupLockMerkleTree {
    /// The merkle root, which is uploaded on-chain
    pub merkle_root: [u8; 32],
    pub version: u64,
    pub max_claim_amount: u64,
    pub max_escrow: u64,
    pub tree_nodes: Vec<TreeNode>,
}

pub type Result<T> = result::Result<T, MerkleTreeError>;

impl JupLockMerkleTree {
    pub fn get_max_total_claim(&self) -> u64 {
        self.max_claim_amount
    }
    pub fn new(tree_nodes: Vec<TreeNode>, version: u64) -> Result<Self> {
        // Combine tree nodes with the same claimant, while retaining original order
        let mut tree_nodes_map: IndexMap<Pubkey, TreeNode> = IndexMap::new();
        for tree_node in tree_nodes {
            let recipient = tree_node.recipient;
            tree_nodes_map
                .entry(recipient)
                .and_modify(|n| {
                    panic!("duplicate claimant {}", n.recipient);
                    // n.amount = n.amount.checked_add(tree_node.amount).unwrap();
                    // n.locked_amount = n
                    //     .locked_amount
                    //     .checked_add(tree_node.locked_amount)
                    //     .unwrap();
                })
                .or_insert_with(|| tree_node); // If not exists, insert a new entry
        }

        // Convert IndexMap back to Vec while preserving the order
        let mut tree_nodes: Vec<TreeNode> = tree_nodes_map.values().cloned().collect();

        let hashed_nodes = tree_nodes
            .iter()
            .map(|claim_info| claim_info.hash().to_bytes())
            .collect::<Vec<_>>();

        let tree = MerkleTree::new(&hashed_nodes[..], true);

        for (i, tree_node) in tree_nodes.iter_mut().enumerate() {
            tree_node.proof = Some(get_proof(&tree, i));
        }
        let tree = JupLockMerkleTree {
            merkle_root: tree
                .get_root()
                .ok_or(MerkleTreeError::MerkleRootError)?
                .to_bytes(),
            version,
            max_claim_amount: get_total_claim_amount(tree_nodes.as_ref()),
            max_escrow: tree_nodes.len() as u64,
            tree_nodes,
        };

        println!(
            "created jup lock version {} with {} escrows and total claim amount {} root {:?}",
            version, tree.max_escrow, tree.max_claim_amount, tree.merkle_root,
        );
        tree.validate()?;
        Ok(tree)
    }

    /// Load a merkle tree from a csv path
    pub fn new_from_csv(path: &PathBuf, version: u64) -> Result<Self> {
        let csv_entries = CsvEntry::new_from_file(path)?;
        let tree_nodes: Vec<TreeNode> = csv_entries
            .into_iter()
            .map(|x| TreeNode::from_csv(x))
            .collect();
        let tree = Self::new(tree_nodes, version)?;
        Ok(tree)
    }

    pub fn new_from_entries(csv_entries: Vec<CsvEntry>, version: u64) -> Result<Self> {
        let tree_nodes: Vec<TreeNode> = csv_entries
            .into_iter()
            .map(|x| TreeNode::from_csv(x))
            .collect();
        let tree = Self::new(tree_nodes, version)?;
        Ok(tree)
    }

    /// Load a serialized merkle tree from file path
    pub fn new_from_file(path: &PathBuf) -> Result<Self> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let tree: JupLockMerkleTree = serde_json::from_reader(reader)?;

        Ok(tree)
    }

    /// Write a merkle tree to a filepath
    pub fn write_to_file(&self, path: &PathBuf) {
        let serialized = serde_json::to_string_pretty(&self).unwrap();
        let mut file = File::create(path).unwrap();
        file.write_all(serialized.as_bytes()).unwrap();
    }

    pub fn get_node(&self, recipient: &Pubkey) -> TreeNode {
        for i in self.tree_nodes.iter() {
            if i.recipient == *recipient {
                return i.clone();
            }
        }

        panic!("Claimant not found in tree");
    }

    fn validate(&self) -> Result<()> {
        // The Merkle tree can be at most height 32, implying a max node count of 2^32 - 1
        if self.max_escrow > 2u64.pow(32) - 1 {
            return Err(MerkleValidationError(format!(
                "Max num nodes {} is greater than 2^32 - 1",
                self.max_escrow
            )));
        }

        // validate that the length is equal to the max_num_nodes
        if self.tree_nodes.len() != self.max_escrow as usize {
            return Err(MerkleValidationError(format!(
                "Tree nodes length {} does not match max_num_nodes {}",
                self.tree_nodes.len(),
                self.max_escrow
            )));
        }

        // validate that there are no duplicate claimants
        let unique_nodes: HashSet<_> = self.tree_nodes.iter().map(|n| n.recipient).collect();

        if unique_nodes.len() != self.tree_nodes.len() {
            return Err(MerkleValidationError(
                "Duplicate recipient found".to_string(),
            ));
        }

        // validate total_unlocked_amount
        let max_claim_amount = get_total_claim_amount(&self.tree_nodes);
        if max_claim_amount != self.max_claim_amount {
            return Err(MerkleValidationError(format!(
                "Tree nodes max_claim_amount {} does not match {}",
                max_claim_amount, self.max_claim_amount
            )));
        }

        if self.verify_proof().is_err() {
            return Err(MerkleValidationError(
                "Merkle root is invalid given nodes".to_string(),
            ));
        }

        Ok(())
    }

    /// verify that the leaves of the merkle tree match the nodes
    pub fn verify_proof(&self) -> Result<()> {
        let root = self.merkle_root;

        // Recreate root given nodes
        let hashed_nodes: Vec<[u8; 32]> = self
            .tree_nodes
            .iter()
            .map(|n| n.hash().to_bytes())
            .collect();
        let mk = MerkleTree::new(&hashed_nodes[..], true);

        assert_eq!(
            mk.get_root()
                .ok_or(MerkleValidationError("invalid merkle proof".to_string()))?
                .to_bytes(),
            root
        );

        // Verify each node against the root
        for (i, _node) in hashed_nodes.iter().enumerate() {
            let node = hashv(&[LEAF_PREFIX, &hashed_nodes[i]]);
            let proof = get_proof(&mk, i);

            if !verify(proof, root, node.to_bytes()) {
                return Err(MerkleValidationError("invalid merkle proof".to_string()));
            }
        }

        Ok(())
    }

    // Converts Merkle Tree to a map for faster key access
    pub fn convert_to_hashmap(&self) -> HashMap<Pubkey, TreeNode> {
        self.tree_nodes
            .iter()
            .map(|n| (n.recipient, n.clone()))
            .collect()
    }
}
