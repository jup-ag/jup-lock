pub mod instructions;
use std::path::PathBuf;

use anchor_client::solana_sdk::signer::keypair::read_keypair_file;

use clap::{Parser, Subcommand};
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signer::keypair::Keypair};

use crate::instructions::*;
#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
pub struct Args {
    #[clap(subcommand)]
    pub command: Commands,

    /// RPC url
    #[clap(long, env, default_value = "http://localhost:8899")]
    pub rpc_url: String,

    /// Payer keypair
    #[clap(long, env)]
    pub keypair_path: Option<String>,

    /// Priority fee
    #[clap(long, env)]
    pub priority_fee: Option<u64>,
}

// Subcommands
#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Claim unlocked tokens
    InitializeLockEscrowFromFile(InitializeLockEscrowFromFileArgs),
}

#[derive(Parser, Debug)]
pub struct InitializeLockEscrowFromFileArgs {
    /// file should in csv format: |address|cliff_unlock_amount|amount_per_period
    /// we skip row if signature field is valid to allow retry
    #[clap(long, env)]
    pub wallet_path: PathBuf,
    /// token mint
    #[clap(long, env)]
    pub token_mint: Pubkey,
    /// vesting start time
    #[clap(long, env)]
    pub vesting_start_time: u64,
    /// cliff time
    #[clap(long, env)]
    pub cliff_time: u64,
    /// frequency
    #[clap(long, env)]
    pub frequency: u64,
    /// numer of period
    #[clap(long, env)]
    pub number_of_period: u64,
    /// update recipient mode
    #[clap(long, env)]
    pub update_recipient_mode: u8,
}

fn main() {
    let args = Args::parse();

    match &args.command {
        Commands::InitializeLockEscrowFromFile(sub_args) => {
            initialize_lock_escrow_from_file(&args, sub_args)
        }
    }
}
