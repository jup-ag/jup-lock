use anchor_spl::memo::Memo;
use anchor_spl::token_interface::{
    close_account, CloseAccount, Mint, TokenAccount, TokenInterface,
};
use util::{
    harvest_fees, parse_remaining_accounts, transfer_to_user_v3, AccountsType,
    ParsedRemainingAccounts, TRANSFER_MEMO_CANCEL_VESTING,
};
use crate::util::MemoTransferContext;
use crate::*;

/// Accounts for [locker::cancel_vesting_escrow_v3].
#[derive(Accounts)]
#[event_cpi]
pub struct CancelVestingEscrowV3<'info> {
    /// Escrow.
    #[account(
        mut,
        has_one = token_mint,
        constraint = escrow.load()?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrowV3>,

    /// Mint.
    #[account(mut)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Escrow Token Account.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator Token Account.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow.load()?.creator,
        associated_token::token_program = token_program
    )]
    pub creator_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECKED: The Token Account will receive the rent
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

impl<'info> CancelVestingEscrowV3<'info> {
    fn close_escrow_token_v3(&self) -> Result<()> {
        let escrow = self.escrow.load()?;
        let escrow_seeds = escrow_seeds_v3!(escrow);

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

pub fn handle_cancel_vesting_escrow_v3<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CancelVestingEscrowV3<'info>>,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let signer = ctx.accounts.signer.key();
    escrow.validate_cancel_actor(signer)?;

    let current_ts = Clock::get()?.unix_timestamp as u64;
    let remaining_amount = ctx.accounts.escrow_token.amount;
    escrow.cancelled_at = current_ts;
    require!(escrow.cancelled_at > 0, LockerError::CancelledAtIsZero);
    drop(escrow);

    // Process remaining accounts
    let mut remaining_accounts = &ctx.remaining_accounts[..];
    let parsed_transfer_hook_accounts = match remaining_accounts_info {
        Some(info) => parse_remaining_accounts(
            &mut remaining_accounts,
            &info.slices,
            &[AccountsType::TransferHookEscrow],
        )?,
        None => ParsedRemainingAccounts::default(),
    };

    // Transfer the remaining amount to the creator
    transfer_to_user_v3(
        &ctx.accounts.escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.escrow_token.to_account_info(),
        &ctx.accounts.creator_token,
        &ctx.accounts.token_program,
        Some(MemoTransferContext {
            memo_program: &ctx.accounts.memo_program,
            memo: TRANSFER_MEMO_CANCEL_VESTING.as_bytes(),
        }),
        remaining_amount,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    // Do fee harvesting
    harvest_fees(
        &ctx.accounts.token_program,
        &ctx.accounts.escrow_token.to_account_info(),
        &ctx.accounts.token_mint,
    )?;

    ctx.accounts.close_escrow_token_v3()?;

    emit_cpi!(EventCancelVestingEscrowV3 {
        escrow: ctx.accounts.escrow.key(),
        signer,
        remaining_amount,
        cancelled_at: current_ts,
    });
    Ok(())
}
