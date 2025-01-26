use crate::Args;
use crate::VerifyAllEscrowCreatedArgs;
use locker::VestingEscrow;
use merkle_tree::jup_lock_merkle_tree::JupLockMerkleTree;
use solana_sdk::pubkey::Pubkey;

pub fn process_verify_all_escrow_created(args: &Args, sub_args: &VerifyAllEscrowCreatedArgs) {
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

    for node in merkle_tree.tree_nodes.iter() {
        let recipient = node.recipient;

        let (base, _bump) = Pubkey::find_program_address(
            &[b"base".as_ref(), root_escrow.as_ref(), recipient.as_ref()],
            &program.id(),
        );

        println!("verify {}", recipient);

        let (escrow, _bump) =
            Pubkey::find_program_address(&[b"escrow".as_ref(), base.as_ref()], &program.id());

        let escrow_state: VestingEscrow = program.account(escrow).unwrap();

        assert_eq!(escrow_state.recipient, recipient);
        assert_eq!(escrow_state.vesting_start_time, node.vesting_start_time);
        assert_eq!(escrow_state.cliff_time, node.cliff_time);
        assert_eq!(escrow_state.cliff_unlock_amount, node.cliff_unlock_amount);
        assert_eq!(escrow_state.frequency, node.frequency);
        assert_eq!(escrow_state.amount_per_period, node.amount_per_period);
        assert_eq!(escrow_state.number_of_period, node.number_of_period);
        assert_eq!(
            escrow_state.update_recipient_mode,
            node.update_recipient_mode
        );
        assert_eq!(escrow_state.cancel_mode, node.cancel_mode);
    }
    println!("Verified all escrows are created")
}
