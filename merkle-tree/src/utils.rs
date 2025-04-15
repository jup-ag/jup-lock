use anchor_lang::solana_program::pubkey::Pubkey;

use crate::{merkle_tree::MerkleTree, tree_node::TreeNode};

pub fn get_proof(merkle_tree: &MerkleTree, index: usize) -> Vec<[u8; 32]> {
    let mut proof = Vec::new();
    let path = merkle_tree.find_path(index).expect("path to index");
    for branch in path.get_proof_entries() {
        if let Some(hash) = branch.get_left_sibling() {
            proof.push(hash.to_bytes());
        } else if let Some(hash) = branch.get_right_sibling() {
            proof.push(hash.to_bytes());
        } else {
            panic!("expected some hash at each level of the tree");
        }
    }
    proof
}

// /// Given a set of tree nodes, get the total unlocked amount. Panics on overflow
pub fn get_total_claim_amount(nodes: &[TreeNode]) -> u64 {
    nodes
        .iter()
        .try_fold(0, |acc: u64, n| acc.checked_add(n.total_amount()))
        .unwrap()
}

pub fn get_root_escrow_pda(
    program_id: &Pubkey,
    base: &Pubkey,
    mint: &Pubkey,
    version: u64,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"root_escrow".as_ref(),
            base.as_ref(),
            mint.as_ref(),
            version.to_le_bytes().as_ref(),
        ],
        program_id,
    )
}

#[derive(Debug)]
pub struct MerkleValidationError {
    pub msg: String,
}
