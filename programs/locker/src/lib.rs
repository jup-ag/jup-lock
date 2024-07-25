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
declare_id!("2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg");

#[cfg(feature = "localnet")]
declare_id!("2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg");

#[program]
pub mod locker {
    use super::*;

    pub fn create_vesting_plan(
        ctx: Context<CreateVestingPlanCtx>,
        params: CreateVestingPlanParameters,
    ) -> Result<()> {
        handle_create_vesting_plan(ctx, &params)
    }

    pub fn claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
        handle_claim(ctx, max_amount)
    }

    pub fn create_escrow_metadata(
        ctx: Context<CreateEscrowMetadataCtx>,
        params: CreateEscrowMetadataParameters,
    ) -> Result<()> {
        handle_create_escrow_metadata(ctx, &params)
    }

    // TODO add function to close escrow after all token has been claimed
}
