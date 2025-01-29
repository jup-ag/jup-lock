use crate::Args;
use crate::FundRootEscrowArgs;
use anchor_client::anchor_lang::InstructionData;
use anchor_client::anchor_lang::ToAccountMetas;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token;
use locker::RootEscrow;
use merkle_tree::jup_lock_merkle_tree::JupLockMerkleTree;
use solana_rpc_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::transaction::Transaction;
use solana_sdk::{
    compute_budget::ComputeBudgetInstruction, instruction::Instruction, pubkey::Pubkey,
    signature::read_keypair_file,
};

pub fn process_fund_root_escrow(args: &Args, sub_args: &FundRootEscrowArgs) {
    let program = args.get_program_client();
    let payer_kp = read_keypair_file(args.keypair_path.clone().unwrap()).unwrap();

    let merkle_tree = JupLockMerkleTree::new_from_file(&sub_args.merkle_tree_path).unwrap();

    let mut ixs = vec![];
    // check priority fee
    if let Some(priority_fee) = args.priority_fee {
        ixs.push(ComputeBudgetInstruction::set_compute_unit_price(
            priority_fee,
        ));
    }

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

    let should_fund_amount = root_escrow_state
        .max_claim_amount
        .checked_sub(root_escrow_state.total_funded_amount)
        .unwrap();

    assert!(should_fund_amount > 0);

    let (event_authority, _bump) =
        Pubkey::find_program_address(&[b"__event_authority"], &program.id());
    ixs.push(Instruction {
        program_id: program.id(),
        accounts: locker::accounts::FundRootEscrowCtx {
            root_escrow,
            token_mint: sub_args.mint,
            root_escrow_token: get_associated_token_address(&root_escrow, &sub_args.mint),
            payer: program.payer(),
            payer_token: get_associated_token_address(&program.payer(), &sub_args.mint),
            system_program: solana_program::system_program::id(),
            event_authority,
            program: program.id(),
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::ID,
        }
        .to_account_metas(None),
        data: locker::instruction::FundRootEscrow {
            max_amount: should_fund_amount,
            remaining_accounts_info: None,
        }
        .data(),
    });

    let client =
        RpcClient::new_with_commitment(args.rpc_url.clone(), CommitmentConfig::finalized());
    let blockhash = client.get_latest_blockhash().unwrap();
    let tx =
        Transaction::new_signed_with_payer(&ixs, Some(&program.payer()), &[&payer_kp], blockhash);

    let signature = client
        .send_and_confirm_transaction_with_spinner(&tx)
        .unwrap();

    println!("signature {:?}", signature);
}
