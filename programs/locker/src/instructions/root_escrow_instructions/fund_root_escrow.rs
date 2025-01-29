use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::util::{
    calculate_transfer_fee_included_amount, parse_remaining_accounts, transfer_to_escrow2,
    AccountsType, ParsedRemainingAccounts,
};
use crate::*;

#[event_cpi]
#[derive(Accounts)]
pub struct FundRootEscrowCtx<'info> {
    /// Root Escrow.
    #[account(mut, has_one = token_mint)]
    pub root_escrow: AccountLoader<'info, RootEscrow>,

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Escrow Token Account.
    #[account(
        init_if_needed,
        associated_token::mint = token_mint,
        associated_token::authority = root_escrow,
        associated_token::token_program = token_program,
        payer=payer,
    )]
    pub root_escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Payer Token Account.
    #[account(mut)]
    pub payer_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// system program.
    pub system_program: Program<'info, System>,
    // Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_fund_root_escrow<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, FundRootEscrowCtx<'info>>,
    max_amount: u64,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
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

    let funded_amount = {
        let mut root_escrow = ctx.accounts.root_escrow.load_mut()?;
        root_escrow.get_and_set_fund_amount(max_amount)?
    };
    require!(funded_amount != 0, LockerError::AmountIsZero);

    transfer_to_escrow2(
        &ctx.accounts.payer,
        &ctx.accounts.token_mint,
        &ctx.accounts.payer_token,
        &ctx.accounts.root_escrow_token,
        &ctx.accounts.token_program,
        calculate_transfer_fee_included_amount(funded_amount, &ctx.accounts.token_mint)?,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    emit_cpi!(EventFundRootEscrow {
        root_escrow: ctx.accounts.root_escrow.key(),
        funded_amount
    });

    Ok(())
}
