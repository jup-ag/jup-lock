use crate::Args;
use crate::VerifyRootEscrowArgs;
use locker::RootEscrow;
use merkle_tree::jup_lock_merkle_tree::JupLockMerkleTree;
use solana_sdk::pubkey::Pubkey;

pub fn process_verify_root_escrow(args: &Args, sub_args: &VerifyRootEscrowArgs) {
    let program = args.get_program_client();

    let merkle_tree = JupLockMerkleTree::new_from_file(&sub_args.merkle_tree_path).unwrap();

    let (root_escrow, _bump) = Pubkey::find_program_address(
        &[
            b"root_escrow".as_ref(),
            sub_args.base.as_ref(),
            sub_args.mint.as_ref(),
            merkle_tree.version.to_le_bytes().as_ref(),
        ],
        &program.id(),
    );

    let root_escrow_state: RootEscrow = program.account(root_escrow).unwrap();

    assert_eq!(root_escrow_state.creator, sub_args.creator);
    assert_eq!(
        root_escrow_state.max_claim_amount,
        merkle_tree.max_claim_amount
    );
    assert_eq!(root_escrow_state.max_escrow, merkle_tree.max_escrow);
    assert_eq!(root_escrow_state.version, merkle_tree.version);
    assert_eq!(root_escrow_state.root, merkle_tree.merkle_root);

    println!("verified, no issue");
}
