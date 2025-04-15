pub mod instructions;

use std::{path::PathBuf, rc::Rc};

use anchor_client::{
    solana_sdk::signer::keypair::read_keypair_file, Client as AnchorClient, Cluster, Program,
};

use anchor_client::solana_sdk::{
    commitment_config::CommitmentConfig, pubkey::Pubkey, signer::keypair::Keypair,
};
use clap::{Parser, Subcommand};

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

    #[clap(long, env)]
    pub program_id: Option<Pubkey>,
}

impl Args {
    fn get_program_client(&self) -> Program<Rc<Keypair>> {
        let payer = match self.keypair_path.clone() {
            Some(value) => read_keypair_file(value).unwrap(),
            None => Keypair::new(),
        };
        let client = AnchorClient::new_with_options(
            Cluster::Custom(self.rpc_url.clone(), self.rpc_url.clone()),
            Rc::new(Keypair::from_bytes(&payer.to_bytes()).unwrap()),
            CommitmentConfig::finalized(),
        );
        let program_id = match self.program_id.clone() {
            Some(value) => value,
            None => locker::ID,
        };
        let program: anchor_client::Program<Rc<Keypair>> = client.program(program_id).unwrap();
        program
    }
}

// Subcommands
#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Claim unlocked tokens
    InitializeLockEscrowFromFile(InitializeLockEscrowFromFileArgs),
    /// Create merkle tree and print root
    CreateMerkleTree(CreateMerkleTreeArgs),
    /// Generate test lock
    GenerateTestLock(GenerateTestLockArgs),
    /// Create root escrow
    CreateRootEscrow(CreateRootEscrowArgs),
    /// Verify root escrow
    VerifyRootEscrow(VerifyRootEscrowArgs),
    /// Fund root escrow
    FundRootEscrow(FundRootEscrowArgs),
    /// Create vesting escrow from root
    CreateVestingEcrowFromRoot(CreateVestingEcrowFromRootArgs),
    /// Verify all escrows has been created
    VerifyAllEscrowCreated(VerifyAllEscrowCreatedArgs),
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
    /// cancel mode
    #[clap(long, env)]
    pub cancel_mode: u8,
}

#[derive(Parser, Debug)]
pub struct GenerateTestLockArgs {
    #[clap(long, env)]
    pub csv_path: PathBuf,
    #[clap(long, env)]
    pub num_node: u64,
}
#[derive(Parser, Debug)]
pub struct CreateMerkleTreeArgs {
    /// CSV path
    #[clap(long, env)]
    pub csv_path: PathBuf,

    /// Merkle tree out path
    #[clap(long, env)]
    pub merkle_tree_path: PathBuf,
}

#[derive(Parser, Debug)]
pub struct CreateRootEscrowArgs {
    /// Merkle tree out path
    #[clap(long, env)]
    pub merkle_tree_path: PathBuf,
    /// creator
    #[clap(long, env)]
    pub creator: Pubkey,
    #[clap(long, env)]
    pub base_key: String,
    /// token mint
    #[clap(long, env)]
    pub mint: Pubkey,
}

#[derive(Parser, Debug)]
pub struct VerifyRootEscrowArgs {
    /// Merkle tree out path
    #[clap(long, env)]
    pub merkle_tree_path: PathBuf,
    /// creator
    #[clap(long, env)]
    pub creator: Pubkey,

    #[clap(long, env)]
    pub base: Pubkey,
    /// token mint
    #[clap(long, env)]
    pub mint: Pubkey,
}

#[derive(Parser, Debug)]
pub struct FundRootEscrowArgs {
    /// Merkle tree out path
    #[clap(long, env)]
    pub merkle_tree_path: PathBuf,

    #[clap(long, env)]
    pub base: Pubkey,
    /// token mint
    #[clap(long, env)]
    pub mint: Pubkey,
}

#[derive(Parser, Debug)]
pub struct CreateVestingEcrowFromRootArgs {
    /// Merkle tree out path
    #[clap(long, env)]
    pub merkle_tree_path: PathBuf,

    #[clap(long, env)]
    pub base: Pubkey,
    /// token mint
    #[clap(long, env)]
    pub mint: Pubkey,
}

#[derive(Parser, Debug)]
pub struct VerifyAllEscrowCreatedArgs {
    /// Merkle tree out path
    #[clap(long, env)]
    pub merkle_tree_path: PathBuf,

    #[clap(long, env)]
    pub base: Pubkey,
    /// token mint
    #[clap(long, env)]
    pub mint: Pubkey,
}

fn main() {
    let args = Args::parse();

    match &args.command {
        Commands::InitializeLockEscrowFromFile(sub_args) => {
            process_initialize_lock_escrow_from_file(&args, sub_args)
        }
        Commands::CreateMerkleTree(sub_args) => process_create_merkle_tree(sub_args),
        Commands::GenerateTestLock(subg_args) => process_generate_test_lock(subg_args),
        Commands::CreateRootEscrow(sub_args) => process_create_root_escrow(&args, sub_args),
        Commands::VerifyRootEscrow(sub_args) => process_verify_root_escrow(&args, sub_args),
        Commands::FundRootEscrow(sub_args) => process_fund_root_escrow(&args, sub_args),
        Commands::CreateVestingEcrowFromRoot(sub_args) => {
            process_create_vesting_escrow_from_root(&args, &sub_args)
        }
        Commands::VerifyAllEscrowCreated(sub_args) => {
            process_verify_all_escrow_created(&args, sub_args)
        }
    }
}
