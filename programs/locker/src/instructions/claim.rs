use anchor_spl::token::{Token, TokenAccount};

use crate::*;
use crate::util::token::transfer_to_user;

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCtx<'info> {
    #[account(
        mut,
        has_one = recipient,
        constraint = escrow.load() ?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(
        mut,
        associated_token::mint = escrow.load() ?.token_mint,
        associated_token::authority = escrow
    )]
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        constraint = recipient_token.key() != escrow_token.key() @ LockerError::InvalidRecipientTokenAccount
    )]
    pub recipient_token: Box<Account<'info, TokenAccount>>,

    /// Token program.
    pub token_program: Program<'info, Token>,
}

pub fn handle_claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
    let current_ts = Clock::get()?.unix_timestamp as u64;
    let mut escrow = ctx.accounts.escrow.load_mut()?;

    let amount = escrow.claim(max_amount)?;

    // localnet debug
    #[cfg(feature = "localnet")]
    msg!(
        "claim amount {} {} {}",
        amount,
        current_ts,
        escrow.cliff_time
    );

    drop(escrow);

    transfer_to_user(
        &ctx.accounts.escrow,
        &ctx.accounts.escrow_token,
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        amount,
    )?;

    emit_cpi!(EventClaim {
        amount,
        current_ts,
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
