use anchor_spl::token::{Mint, Token, TokenAccount};
use solana_program::program::invoke_signed;
use spl_token::instruction::close_account;

use crate::safe_math::SafeMath;
use crate::util::token::transfer_to_user;
use crate::*;

/// Accounts for [locker::cancel_vesting_escrow].
#[derive(Accounts)]
#[event_cpi]
pub struct CancelVestingEscrow<'info> {
    /// Escrow.
    #[account(
        mut,
        has_one = token_mint,
        constraint = escrow.load()?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow
    )]
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow.load()?.creator
    )]
    pub creator_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow.load()?.recipient
    )]
    pub recipient_token: Box<Account<'info, TokenAccount>>,

    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECKED: the creator will receive the rent back
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    /// Signer.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> CancelVestingEscrow<'info> {
    fn close_escrow_token(&self) -> Result<()> {
        let escrow = self.escrow.load()?;
        let escrow_seeds = escrow_seeds!(escrow);

        invoke_signed(
            &close_account(
                self.token_program.key,
                self.escrow_token.to_account_info().key,
                self.rent_receiver.key,
                &self.escrow.key(),
                &[],
            )?,
            &[
                self.token_program.to_account_info(),
                self.escrow_token.to_account_info(),
                self.rent_receiver.to_account_info(),
                self.escrow.to_account_info(),
            ],
            &[&escrow_seeds[..]],
        )?;

        Ok(())
    }
}

pub fn handle_cancel_vesting_escrow(ctx: Context<CancelVestingEscrow>) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let signer = ctx.accounts.signer.key();
    escrow.validate_cancel_actor(signer)?;

    let current_ts = Clock::get()?.unix_timestamp as u64;
    let claimable_amount = escrow.get_claimable_amount(current_ts)?;
    let remaining_amount = ctx
        .accounts
        .escrow_token
        .amount
        .safe_sub(claimable_amount)?;
    escrow.cancelled_at = current_ts;
    require!(escrow.cancelled_at > 0, LockerError::TimestampZero);
    drop(escrow);

    // Transfer the claimable amount to the recipient
    transfer_to_user(
        &ctx.accounts.escrow,
        &ctx.accounts.escrow_token,
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        claimable_amount,
    )?;

    // Transfer the locked amount to the sender
    transfer_to_user(
        &ctx.accounts.escrow,
        &ctx.accounts.escrow_token,
        &ctx.accounts.creator_token,
        &ctx.accounts.token_program,
        remaining_amount,
    )?;

    ctx.accounts.close_escrow_token()?;

    emit_cpi!(EventCancelVestingEscrow {
        escrow: ctx.accounts.escrow.key(),
        signer,
        claimable_amount,
        remaining_amount,
        cancelled_at: current_ts,
    });
    Ok(())
}
