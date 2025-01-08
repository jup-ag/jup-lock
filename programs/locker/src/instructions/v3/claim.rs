use crate::util::{transfer_to_user_v2, MemoTransferContext};
use crate::*;
use anchor_spl::memo::Memo;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use util::{
    parse_remaining_accounts, AccountsType, ParsedRemainingAccounts, TRANSFER_MEMO_CLAIM_VESTING,
};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimV3<'info> {
    /// Escrow.
    #[account(
        mut,
        has_one = token_mint,
        constraint = escrow.load()?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    /// Mint.
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Escrow Token Account.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Recipient.
    #[account(mut)]
    pub recipient: Signer<'info>,

    /// Recipient Token Account.
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

pub fn handle_claim_v3<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ClaimV3<'info>>,
    max_amount: u64,
    proof: Vec<[u8; 32]>,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;

    // verify proof of recipient
    escrow.verify_recipient(ctx.accounts.recipient.key(), proof)?;

    let amount = escrow.claim(max_amount)?;
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

    transfer_to_user_v2(
        &ctx.accounts.escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.escrow_token.to_account_info(),
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        Some(MemoTransferContext {
            memo_program: &ctx.accounts.memo_program,
            memo: TRANSFER_MEMO_CLAIM_VESTING.as_bytes(),
        }),
        amount,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    let current_ts = Clock::get()?.unix_timestamp as u64;
    emit_cpi!(EventClaimV3 {
        amount,
        current_ts,
        escrow: ctx.accounts.escrow.key(),
        recipient: ctx.accounts.recipient.key(),
    });
    Ok(())
}
