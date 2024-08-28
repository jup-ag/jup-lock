use anchor_spl::token::{Token, TokenAccount};

use crate::*;
use crate::util::token::transfer_to_recipient;

/// Accounts for [locker::cancel_vesting_escrow].
#[derive(Accounts)]
#[event_cpi]
pub struct CancelVestingEscrow<'info> {
    /// Escrow.
    #[account(mut)]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(mut)]
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub creator_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient_token: Box<Account<'info, TokenAccount>>,

    /// Signer.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn handle_cancel_vesting_escrow(
    ctx: Context<CancelVestingEscrow>
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let escrow_token = anchor_spl::associated_token::get_associated_token_address(
        &ctx.accounts.escrow.key(),
        &escrow.token_mint,
    );

    require!(
        escrow.cancelled == 0,
        LockerError::AlreadyCancelled,
    );

    require!(
        escrow_token == ctx.accounts.escrow_token.key(),
        LockerError::InvalidEscrowTokenAddress
    );

    require!(
        escrow.recipient == ctx.accounts.recipient_token.owner && escrow.token_mint == ctx.accounts.recipient_token.mint,
        LockerError::InvalidRecipientTokenAccount,
    );

    require!(
        escrow.creator == ctx.accounts.creator_token.owner && escrow.token_mint == ctx.accounts.creator_token.mint,
        LockerError::InvalidCreatorTokenAccount,
    );

    let signer = ctx.accounts.signer.key();
    if !escrow.validate_cancel_actor(signer).unwrap_or(false) {
        return Err(LockerError::NotPermitToDoThisAction.into());
    }

    let current_ts = Clock::get()?.unix_timestamp as u64;
    let claimable_amount = escrow.get_claimable_amount(current_ts)?;
    let locked_amount = escrow.get_total_deposit_amount()? - claimable_amount;
    escrow.cancelled = 1;
    drop(escrow);

    // Transfer the claimable amount to the recipient
    if claimable_amount > 0 {
        transfer_to_recipient(
            &ctx.accounts.escrow,
            &ctx.accounts.escrow_token,
            &ctx.accounts.recipient_token,
            &ctx.accounts.token_program,
            claimable_amount,
        )?;
    }

    // Transfer the locked amount to the sender
    if locked_amount > 0 {
        transfer_to_recipient(
            &ctx.accounts.escrow,
            &ctx.accounts.escrow_token,
            &ctx.accounts.creator_token,
            &ctx.accounts.token_program,
            locked_amount,
        )?;
    }

    emit_cpi!(EventCancelVestingEscrow {
        escrow: ctx.accounts.escrow.key(),
        signer,
        claimable_amount,
        locked_amount,
    });
    Ok(())
}