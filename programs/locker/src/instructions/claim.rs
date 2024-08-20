use anchor_spl::token::{Token, TokenAccount};

use crate::*;
use crate::util::token::transfer_to_recipient;

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCtx<'info> {
    #[account(mut, has_one = recipient)]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(mut)]
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut, constraint = recipient_token.key() != escrow_token.key() @ LockerError::InvalidRecipientTokenAccount
    )]
    pub recipient_token: Box<Account<'info, TokenAccount>>,

    /// Token program.
    pub token_program: Program<'info, Token>,
}

pub fn handle_claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let escrow_token = anchor_spl::associated_token::get_associated_token_address(
        &ctx.accounts.escrow.key(),
        &escrow.token_mint,
    );

    require!(
        escrow_token == ctx.accounts.escrow_token.key(),
        LockerError::InvalidEscrowTokenAddress
    );

    let amount = escrow.claim(max_amount)?;
    drop(escrow);

    transfer_to_recipient(
        &ctx.accounts.escrow,
        &ctx.accounts.escrow_token,
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        amount,
    )?;

    let current_ts = Clock::get()?.unix_timestamp as u64;
    emit_cpi!(EventClaim {
        amount,
        current_ts,
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
