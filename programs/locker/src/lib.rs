use anchor_lang::prelude::*;

pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

use crate::util::RemainingAccountsInfo;

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

    /// Create a vesting escrow for the given params
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * params - The params needed by instruction.
    ///   * vesting_start_time - The creation time of this escrow
    ///   * cliff_time - Trade cliff time of the escrow
    ///   * frequency - How frequent the claimable amount will be updated
    ///   * cliff_unlock_amount - The amount unlocked after cliff time
    ///   * amount_per_period - The amount unlocked per vesting period
    ///   * number_of_period - The total number of vesting period
    ///   * update_recipient_mode - Decide who can update the recipient of the escrow
    ///   * cancel_mode - Decide who can cancel the the escrow
    ///
    pub fn create_vesting_escrow(
        ctx: Context<CreateVestingEscrowCtx>,
        params: CreateVestingEscrowParameters,
    ) -> Result<()> {
        handle_create_vesting_escrow(ctx, &params)
    }

    /// Claim maximum amount from the vesting escrow
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * max_amount - The maximum amount claimed by the recipient
    ///
    pub fn claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
        handle_claim(ctx, max_amount)
    }

    /// Create vesting escrow metadata
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * params - The params needed by instruction.
    ///   * name - The name of the vesting escrow
    ///   * description - The description of the vesting escrow
    ///   * creator_email - The email of the creator
    ///   * recipient_email - The email of the recipient
    ///
    pub fn create_vesting_escrow_metadata(
        ctx: Context<CreateVestingEscrowMetadataCtx>,
        params: CreateVestingEscrowMetadataParameters,
    ) -> Result<()> {
        handle_create_vesting_escrow_metadata(ctx, &params)
    }

    /// Update vesting escrow metadata
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * new_recipient - The address of the new recipient
    /// * new_recipient_email - The email of the new recipient
    ///
    pub fn update_vesting_escrow_recipient(
        ctx: Context<UpdateVestingEscrowRecipientCtx>,
        new_recipient: Pubkey,
        new_recipient_email: Option<String>,
    ) -> Result<()> {
        handle_update_vesting_escrow_recipient(ctx, new_recipient, new_recipient_email)
    }

    // V2 instructions

    /// Create a vesting escrow for the given params
    /// This instruction supports both splToken and token2022
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * params - The params needed by instruction.
    ///   * vesting_start_time - The creation time of this escrow
    ///   * cliff_time - Trade cliff time of the escrow
    ///   * frequency - How frequent the claimable amount will be updated
    ///   * cliff_unlock_amount - The amount unlocked after cliff time
    ///   * amount_per_period - The amount unlocked per vesting period
    ///   * number_of_period - The total number of vesting period
    ///   * update_recipient_mode - Decide who can update the recipient of the escrow
    ///   * cancel_mode - Decide who can cancel the the escrow
    /// * remaining_accounts_info: additional accounts needed by instruction
    ///
    pub fn create_vesting_escrow_v2<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, CreateVestingEscrowV2<'info>>,
        params: CreateVestingEscrowParameters,
        remaining_accounts_info: Option<RemainingAccountsInfo>,
    ) -> Result<()> {
        handle_create_vesting_escrow_v2(ctx, &params, remaining_accounts_info)
    }

    /// Claim maximum amount from the vesting escrow
    /// This instruction supports both splToken and token2022
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * max_amount - The maximum amount claimed by the recipient
    /// * remaining_accounts_info: additional accounts needed by instruction
    ///
    pub fn claim_v2<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, ClaimV2<'info>>,
        max_amount: u64,
        remaining_accounts_info: Option<RemainingAccountsInfo>,
    ) -> Result<()> {
        handle_claim_v2(ctx, max_amount, remaining_accounts_info)
    }

    // V3 instructions

    /// Create a vesting escrow for the given params
    /// This instruction supports both splToken and token2022
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * params - The params needed by instruction.
    ///   * create_vesting_params - Extended params from create_vesting_escrow_v2
    ///   * root - The root of merkle tree
    /// * remaining_accounts_info: additional accounts needed by instruction
    ///
    pub fn create_vesting_escrow_v3<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, CreateVestingEscrowV3<'info>>,
        params: CreateVestingEscrowParametersV3,
        remaining_accounts_info: Option<RemainingAccountsInfo>,
    ) -> Result<()> {
        handle_create_vesting_escrow_v3(ctx, params, remaining_accounts_info)
    }

    /// Claim maximum amount from the vesting escrow
    /// This instruction supports both splToken and token2022
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * max_amount - The maximum amount claimed by the recipient
    /// * proof: merkle tree proof of recipient
    /// * cap_len: capacity of leaf node
    /// * remaining_accounts_info: additional accounts needed by instruction
    ///
    pub fn claim_v3<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, ClaimV3<'info>>,
        max_amount: u64,
        proof: Vec<[u8; 32]>,
        cap_len: u64,
        remaining_accounts_info: Option<RemainingAccountsInfo>,
    ) -> Result<()> {
        handle_claim_v3(ctx, max_amount, proof, cap_len, remaining_accounts_info)
    }

    /// Update vesting escrow root data
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * new_root - The merkle tree root of the new recipient list
    ///
    pub fn update_vesting_escrow_root<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, UpdateVestingEscrowRoot<'info>>,
        new_root: [u8; 32],
    ) -> Result<()> {
        handle_update_vesting_escrow_root(ctx, new_root)
    }

    /// Cancel a vesting escrow.
    ///   - The claimable token will be transferred to recipient
    ///   - The remaining token will be transferred to the creator
    /// This instruction supports both splToken and token2022
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * remaining_accounts_info: additional accounts needed by instruction
    ///
    pub fn cancel_vesting_escrow<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, CancelVestingEscrow<'info>>,
        remaining_accounts_info: Option<RemainingAccountsInfo>,
    ) -> Result<()> {
        handle_cancel_vesting_escrow(ctx, remaining_accounts_info)
    }

    /// Close vesting escrow
    ///  - Close vesting escrow and escrow ATA and escrow metadata if recipient already claimed all tokens
    ///  - Rent receiver must be escrow's creator
    /// This instruction supports both splToken and token2022
    /// # Arguments
    ///
    /// * ctx - The accounts needed by instruction.
    /// * remaining_accounts_info: additional accounts needed by instruction
    ///
    pub fn close_vesting_escrow<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, CloseVestingEscrow<'info>>,
        remaining_accounts_info: Option<RemainingAccountsInfo>,
    ) -> Result<()> {
        handle_close_vesting_escrow(ctx, remaining_accounts_info)
    }
}
