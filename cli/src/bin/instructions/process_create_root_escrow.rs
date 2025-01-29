use crate::{Args, CreateRootEscrowArgs};
use anchor_client::anchor_lang::InstructionData;
use anchor_client::anchor_lang::ToAccountMetas;
use locker::CreateRootEscrowParameters;
use merkle_tree::jup_lock_merkle_tree::JupLockMerkleTree;
use solana_rpc_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::transaction::Transaction;
use solana_sdk::{
    compute_budget::ComputeBudgetInstruction, instruction::Instruction, pubkey::Pubkey,
    signature::read_keypair_file, signer::Signer,
};

pub fn process_create_root_escrow(args: &Args, sub_args: &CreateRootEscrowArgs) {
    let program = args.get_program_client();
    let base_kp = read_keypair_file(sub_args.base_key.clone()).unwrap();
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
            base_kp.pubkey().as_ref(),
            sub_args.mint.as_ref(),
            merkle_tree.version.to_le_bytes().as_ref(),
        ],
        &program.id(),
    );

    // println!("prpgram id {} {}", program.id(), locker::ID);

    let (event_authority, _bump) =
        Pubkey::find_program_address(&[b"__event_authority"], &program.id());
    ixs.push(Instruction {
        program_id: program.id(),
        accounts: locker::accounts::CreateRootEscrowCtx {
            base: base_kp.pubkey(),
            root_escrow,
            token_mint: sub_args.mint,
            payer: program.payer(),
            creator: sub_args.creator,
            system_program: solana_program::system_program::id(),
            event_authority,
            program: program.id(),
        }
        .to_account_metas(None),
        data: locker::instruction::CreateRootEscrow {
            params: CreateRootEscrowParameters {
                max_claim_amount: merkle_tree.max_claim_amount,
                max_escrow: merkle_tree.max_escrow,
                version: merkle_tree.version,
                root: merkle_tree.merkle_root,
            },
        }
        .data(),
    });

    let client =
        RpcClient::new_with_commitment(args.rpc_url.clone(), CommitmentConfig::finalized());
    let blockhash = client.get_latest_blockhash().unwrap();
    let tx = Transaction::new_signed_with_payer(
        &ixs,
        Some(&program.payer()),
        &[&payer_kp, &base_kp],
        blockhash,
    );

    let signature = client
        .send_and_confirm_transaction_with_spinner(&tx)
        .unwrap();

    println!("signature {:?}", signature);
}
