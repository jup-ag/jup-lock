use anchor_spl::memo::Memo;
use anchor_spl::token_interface::{
    close_account, CloseAccount, Mint, TokenAccount, TokenInterface,
};
use util::TRANSFER_MEMO_CANCEL_VESTING;

use crate::safe_math::SafeMath;
use crate::util::{transfer_to_user_v2, MemoTransferContext};
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

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow.load()?.creator,
        associated_token::token_program = token_program
    )]
    pub creator_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow.load()?.recipient,
        associated_token::token_program = token_program
    )]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECKED: the creator will receive the rent back
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    /// Signer.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Memo program.
    pub memo_program: Program<'info, Memo>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> CancelVestingEscrow<'info> {
    fn close_escrow_token(&self) -> Result<()> {
        let escrow = self.escrow.load()?;
        let escrow_seeds = escrow_seeds!(escrow);

        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.escrow_token.to_account_info(),
                destination: self.rent_receiver.to_account_info(),
                authority: self.escrow.to_account_info(),
            },
            &[&escrow_seeds[..]],
        ))?;

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
    require!(escrow.cancelled_at > 0, LockerError::CancelledAtIsZero);
    drop(escrow);

    // Transfer the claimable amount to the recipient
    transfer_to_user_v2(
        &ctx.accounts.escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.escrow_token,
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        Some(MemoTransferContext {
            memo_program: &ctx.accounts.memo_program,
            memo: TRANSFER_MEMO_CANCEL_VESTING.as_bytes(),
        }),
        claimable_amount,
    )?;

    // Transfer the remaining amount to the creator
    transfer_to_user_v2(
        &ctx.accounts.escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.escrow_token,
        &ctx.accounts.creator_token,
        &ctx.accounts.token_program,
        Some(MemoTransferContext {
            memo_program: &ctx.accounts.memo_program,
            memo: TRANSFER_MEMO_CANCEL_VESTING.as_bytes(),
        }),
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
