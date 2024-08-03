use anchor_lang::prelude::*;

#[macro_use]
pub mod macros;

pub mod instructions;
pub use instructions::*;

pub mod state;
pub use state::*;

pub mod errors;
pub use errors::*;

pub mod safe_math;

pub mod events;
pub use events::*;

#[cfg(not(feature = "localnet"))]
declare_id!("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

#[cfg(feature = "localnet")]
declare_id!("2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg");

#[program]
pub mod locker {
    use super::*;

    pub fn create_vesting_escrow(
        ctx: Context<CreateVestingEscrowCtx>,
        params: CreateVestingEscrowParameters,
    ) -> Result<()> {
        handle_create_vesting_escrow(ctx, &params)
    }

    pub fn claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
        handle_claim(ctx, max_amount)
    }

    pub fn create_vesting_escrow_metadata(
        ctx: Context<CreateVestingEscrowMetadataCtx>,
        params: CreateVestingEscrowMetadataParameters,
    ) -> Result<()> {
        handle_create_vesting_escrow_metadata(ctx, &params)
    }

    pub fn update_vesting_escrow_recipient(
        ctx: Context<UpdateVestingEscrowRecipientCtx>,
        new_recipient: Pubkey,
    ) -> Result<()> {
        handle_update_vesting_escrow_recipient(ctx, new_recipient)
    }

    // TODO add function to close escrow after all token has been claimed
}
