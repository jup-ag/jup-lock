use crate::*;
use anchor_client::anchor_lang::InstructionData;
use anchor_client::anchor_lang::ToAccountMetas;
use anchor_spl::token;
use anyhow::{Ok, Result};
use locker::CreateVestingEscrowParameters;
use serde::{Deserialize, Serialize};
use solana_rpc_client::rpc_client::RpcClient;
use solana_sdk::transaction::Transaction;
use solana_sdk::{
    compute_budget::ComputeBudgetInstruction, instruction::Instruction, pubkey::Pubkey,
    signature::Signature, signer::Signer,
};
use std::fs::File;
use std::str::FromStr;

/// Represents a single entry in a CSV
#[derive(Debug, Clone, Eq, Hash, PartialEq, Serialize, Deserialize)]
pub struct CsvEntry {
    /// address
    pub address: String,
    /// cliff_unlock_amount
    pub cliff_unlock_amount: u64,
    /// amount_per_period
    pub amount_per_period: u64,
}

pub fn initialize_lock_escrow_from_file(args: &Args, sub_args: &InitializeLockEscrowFromFileArgs) {
    println!("initialize lock escrow from file: {sub_args:#?}");
    create_lock_escrow(args, sub_args).unwrap();
}

fn create_lock_escrow(args: &Args, sub_args: &InitializeLockEscrowFromFileArgs) -> Result<()> {
    let &InitializeLockEscrowFromFileArgs {
        wallet_path: _,
        token_mint,
        vesting_start_time,
        cliff_time,
        frequency,
        number_of_period,
        update_recipient_mode,
    } = sub_args;
    let file = File::open(sub_args.wallet_path.clone())?;
    let mut rdr = csv::Reader::from_reader(file);

    let mut entries = Vec::new();
    for result in rdr.deserialize() {
        let record: CsvEntry = result.unwrap();
        entries.push(record);
    }

    // save signature back to csv file
    for entry in entries.iter() {
        let signature = create_lock_escrow_for_an_user(
            args,
            &LockEscrowForAnUserParam {
                wallet: Pubkey::from_str(&entry.address).unwrap(), // panic for invalid wallet
                token_mint,
                vesting_start_time,
                cliff_time,
                frequency,
                cliff_unlock_amount: entry.cliff_unlock_amount,
                amount_per_period: entry.amount_per_period,
                number_of_period,
                update_recipient_mode,
            },
        )?;
        println!(
            "successfully create vesting escrow for address {:?} with signature {signature:#?}",
            entry.address
        );
    }

    Ok(())
}

pub struct LockEscrowForAnUserParam {
    pub wallet: Pubkey,
    pub token_mint: Pubkey,
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
}
fn create_lock_escrow_for_an_user(
    args: &Args,
    sub_args: &LockEscrowForAnUserParam,
) -> Result<Signature> {
    let &LockEscrowForAnUserParam {
        wallet,
        token_mint,
        vesting_start_time,
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        update_recipient_mode,
    } = sub_args;
    let client =
        RpcClient::new_with_commitment(args.rpc_url.clone(), CommitmentConfig::finalized());
    let keypair = read_keypair_file(&args.keypair_path.clone().unwrap()).unwrap();
    let mut ixs = vec![];
    // check priority fee
    if let Some(priority_fee) = args.priority_fee {
        ixs.push(ComputeBudgetInstruction::set_compute_unit_price(
            priority_fee,
        ));
    }

    let base_kp: Keypair = Keypair::new();
    let (escrow, _bump) = Pubkey::find_program_address(
        &[b"escrow".as_ref(), base_kp.pubkey().as_ref()],
        &locker::ID,
    );

    ixs.push(
        spl_associated_token_account::instruction::create_associated_token_account(
            &keypair.pubkey(),
            &escrow,
            &token_mint,
            &token::ID,
        ),
    );
    let (event_authority, _bump) =
        Pubkey::find_program_address(&[b"__event_authority"], &locker::ID);
    ixs.push(Instruction {
        program_id: locker::ID,
        accounts: locker::accounts::CreateVestingEscrowCtx {
            base: base_kp.pubkey(),
            escrow,
            escrow_token: spl_associated_token_account::get_associated_token_address(
                &escrow,
                &token_mint,
            ),
            recipient: wallet,
            sender: keypair.pubkey(),
            sender_token: spl_associated_token_account::get_associated_token_address(
                &keypair.pubkey(),
                &token_mint,
            ),
            event_authority,
            program: locker::ID,
            token_program: token::ID,
            system_program: solana_program::system_program::id(),
        }
        .to_account_metas(None),
        data: locker::instruction::CreateVestingEscrow {
            params: CreateVestingEscrowParameters {
                vesting_start_time,
                cliff_time,
                frequency,
                cliff_unlock_amount,
                amount_per_period,
                number_of_period,
                update_recipient_mode,
            },
        }
        .data(),
    });

    let blockhash = client.get_latest_blockhash().unwrap();
    let tx = Transaction::new_signed_with_payer(
        &ixs,
        Some(&keypair.pubkey()),
        &[&keypair, &base_kp],
        blockhash,
    );

    let signature = client
        .send_and_confirm_transaction_with_spinner(&tx)
        .unwrap();

    Ok(signature)
}
