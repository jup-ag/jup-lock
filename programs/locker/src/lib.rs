use anchor_lang::prelude::*;

pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

#[macro_use]
pub mod macros;

pub mod instructions;

pub mod state;

pub mod errors;

pub mod safe_math;

pub mod events;
pub mod util;

#[cfg(feature = "localnet")]
declare_id!("2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg");

#[cfg(feature = "staging")]
declare_id!("sLovrBvGxvyvBniMxj8uUt9CdD7CV4PhnBnBD6cPSXo");

#[cfg(not(any(feature = "localnet", feature = "staging")))]
declare_id!("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

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
        new_recipient_email: Option<String>,
    ) -> Result<()> {
        handle_update_vesting_escrow_recipient(ctx, new_recipient, new_recipient_email)
    }

    pub fn cancel_vesting_escrow(ctx: Context<CancelVestingEscrow>) -> Result<()> {
        handle_cancel_vesting_escrow(ctx)
    }

    // TODO add function to close escrow after all token has been claimed
}
