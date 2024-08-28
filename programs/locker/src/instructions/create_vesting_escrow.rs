use anchor_spl::token::{Token, TokenAccount};

use crate::*;
use crate::safe_math::SafeMath;
use crate::util::token::transfer_to_escrow;

#[derive(AnchorSerialize, AnchorDeserialize)]
/// Accounts for [locker::create_vesting_escrow].
pub struct CreateVestingEscrowParameters {
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub cancel_mode: u8,
}

impl CreateVestingEscrowParameters {
    pub fn get_total_deposit_amount(&self) -> Result<u64> {
        let total_amount = self
            .cliff_unlock_amount
            .safe_add(self.amount_per_period.safe_mul(self.number_of_period)?)?;
        Ok(total_amount)
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingEscrowCtx<'info> {
    #[account(mut)]
    pub base: Signer<'info>,

    #[account(
        init,
        seeds = [
        b"escrow".as_ref(),
        base.key().as_ref(),
        ],
        bump,
        payer = sender,
        space = 8 + VestingEscrow::INIT_SPACE
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(
        mut,
        associated_token::mint = sender_token.mint,
        associated_token::authority = escrow
    )]
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(mut)]
    pub sender_token: Box<Account<'info, TokenAccount>>,

    /// CHECK: recipient account
    pub recipient: UncheckedAccount<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    // system program
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vesting_escrow(
    ctx: Context<CreateVestingEscrowCtx>,
    params: &CreateVestingEscrowParameters,
) -> Result<()> {
    let &CreateVestingEscrowParameters {
        vesting_start_time,
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        update_recipient_mode,
        cancel_mode,
    } = params;

    require!(
        cliff_time >= vesting_start_time,
        LockerError::InvalidVestingStartTime
    );

    require!(
        UpdateRecipientMode::try_from(update_recipient_mode).is_ok(),
        LockerError::InvalidUpdateRecipientMode,
    );

    require!(frequency != 0, LockerError::FrequencyIsZero);

    let mut escrow = ctx.accounts.escrow.load_init()?;
    escrow.init(
        vesting_start_time,
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        ctx.accounts.recipient.key(),
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
        *ctx.bumps.get("escrow").unwrap(),
        update_recipient_mode,
        cancel_mode,
    );

    transfer_to_escrow(
        &ctx.accounts.sender,
        &ctx.accounts.sender_token,
        &ctx.accounts.escrow_token,
        &ctx.accounts.token_program,
        params.get_total_deposit_amount()?,
    )?;

    emit_cpi!(EventCreateVestingEscrow {
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
        update_recipient_mode,
        vesting_start_time,
        cancel_mode,
    });
    Ok(())
}
