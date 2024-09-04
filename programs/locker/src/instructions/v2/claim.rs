use anchor_spl::memo::Memo;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
};
use util::{parse_remaining_accounts, AccountsType, ParsedRemainingAccounts, TRANSFER_MEMO_CLAIM_VESTING};

use crate::*;
use crate::util::{MemoTransferContext, transfer_to_user_v2};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimV2<'info> {
    #[account(
        mut, 
        has_one = token_mint,
        has_one = recipient,
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

    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        constraint = recipient_token.key() != escrow_token.key() @ LockerError::InvalidRecipientTokenAccount
    )]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Memo program.
    pub memo_program: Program<'info, Memo>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim_v2<'c: 'info, 'info>(
    mut ctx: Context<'_, '_, 'c, 'info, ClaimV2<'info>>,
    max_amount: u64,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;

    let amount = escrow.claim(max_amount)?;
    drop(escrow);

    // Process remaining accounts
    let remaining_accounts = if remaining_accounts_info.is_none() {
        ParsedRemainingAccounts::default()
    } else {
        parse_remaining_accounts(
            &mut ctx.remaining_accounts,
            &remaining_accounts_info.unwrap().slices,
            &[
                AccountsType::TransferHookClaim,
            ],
        )?
    };

    transfer_to_user_v2(
        &ctx.accounts.escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.escrow_token,
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        Some(MemoTransferContext {
            memo_program: &ctx.accounts.memo_program,
            memo: TRANSFER_MEMO_CLAIM_VESTING.as_bytes(),
        }),
        amount,
        remaining_accounts.transfer_hook_claim,
    )?;

    let current_ts = Clock::get()?.unix_timestamp as u64;
    emit_cpi!(EventClaim {
        amount,
        current_ts,
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
