use crate::Args;
use crate::CreateVestingEcrowFromRootArgs;
use anchor_client::anchor_lang::InstructionData;
use anchor_client::anchor_lang::ToAccountMetas;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token;
use locker::CreateVestingEscrowFromRootParams;
use merkle_tree::jup_lock_merkle_tree::JupLockMerkleTree;
use solana_rpc_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::transaction::Transaction;
use solana_sdk::{
    compute_budget::ComputeBudgetInstruction, instruction::Instruction, pubkey::Pubkey,
    signature::read_keypair_file,
};

pub fn process_create_vesting_escrow_from_root(
    args: &Args,
    sub_args: &CreateVestingEcrowFromRootArgs,
) {
    let client =
        RpcClient::new_with_commitment(args.rpc_url.clone(), CommitmentConfig::finalized());
    let program = args.get_program_client();
    let payer_kp = read_keypair_file(args.keypair_path.clone().unwrap()).unwrap();

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

        let (escrow, _bump) =
            Pubkey::find_program_address(&[b"escrow".as_ref(), base.as_ref()], &program.id());

        // check whethere escrow has been creator
        if client.get_account_data(&escrow).is_ok() {
            println!(
                "SKIP: recipient {} has been created, check escrow {}",
                recipient, escrow
            );
            continue;
        }
        let mut ixs = vec![];
        // check priority fee
        if let Some(priority_fee) = args.priority_fee {
            ixs.push(ComputeBudgetInstruction::set_compute_unit_price(
                priority_fee,
            ));
        }

        let (event_authority, _bump) =
            Pubkey::find_program_address(&[b"__event_authority"], &program.id());
        ixs.push(Instruction {
            program_id: program.id(),
            accounts: locker::accounts::CreateVestingEscrowFromRootCtx {
                root_escrow,
                base,
                escrow,
                escrow_token: get_associated_token_address(&escrow, &sub_args.mint),
                root_escrow_token: get_associated_token_address(&root_escrow, &sub_args.mint),
                token_mint: sub_args.mint,
                payer: program.payer(),
                recipient,
                associated_token_program: spl_associated_token_account::ID,
                token_program: spl_token::ID,
                system_program: solana_program::system_program::id(),
                event_authority,
                program: program.id(),
            }
            .to_account_metas(None),
            data: locker::instruction::CreateVestingEscrowFromRoot {
                params: CreateVestingEscrowFromRootParams {
                    vesting_start_time: node.vesting_start_time,
                    cliff_time: node.cliff_time,
                    frequency: node.frequency,
                    cliff_unlock_amount: node.cliff_unlock_amount,
                    amount_per_period: node.amount_per_period,
                    number_of_period: node.number_of_period,
                    update_recipient_mode: node.update_recipient_mode,
                    cancel_mode: node.cancel_mode,
                },
                proof: node.proof.clone().unwrap(),
                remaining_accounts_info: None,
            }
            .data(),
        });

        let blockhash = client.get_latest_blockhash().unwrap();
        let tx = Transaction::new_signed_with_payer(
            &ixs,
            Some(&program.payer()),
            &[&payer_kp],
            blockhash,
        );

        let signature = client
            .send_and_confirm_transaction_with_spinner(&tx)
            .unwrap();

        println!("Done {} signature {:?}", recipient, signature);
    }
}
