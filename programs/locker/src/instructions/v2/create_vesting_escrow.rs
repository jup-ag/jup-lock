use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::util::{
    calculate_transfer_fee_included_amount, parse_remaining_accounts, transfer_to_escrow_v2,
    validate_mint, AccountsType, ParsedRemainingAccounts,
};
use crate::TokenProgramFlag::{UseSplToken, UseToken2022};
use crate::*;

#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingEscrowV2<'info> {
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

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(mut)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: recipient account
    pub recipient: UncheckedAccount<'info>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    // system program
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vesting_escrow_v2<'c: 'info, 'info>(
    mut ctx: Context<'_, '_, 'c, 'info, CreateVestingEscrowV2<'info>>,
    params: &CreateVestingEscrowParameters,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    // Validate if token_mint is supported
    validate_mint(&ctx.accounts.token_mint)?;

    let token_mint_info = ctx.accounts.token_mint.to_account_info();
    let token_program_flag = match *token_mint_info.owner {
        spl_token::ID => Ok(UseSplToken),
        spl_token_2022::ID => Ok(UseToken2022),
        _ => Err(LockerError::IncorrectTokenProgramId),
    }?;

    params.init_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.recipient.key(),
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
        ctx.bumps.escrow,
        token_program_flag,
    )?;

    // Process remaining accounts
    let remaining_accounts = if remaining_accounts_info.is_none() {
        ParsedRemainingAccounts::default()
    } else {
        parse_remaining_accounts(
            &mut ctx.remaining_accounts,
            &remaining_accounts_info.unwrap().slices,
            &[AccountsType::TransferHookInput],
        )?
    };

    transfer_to_escrow_v2(
        &ctx.accounts.sender,
        &ctx.accounts.token_mint,
        &ctx.accounts.sender_token,
        &ctx.accounts.escrow_token,
        &ctx.accounts.token_program,
        calculate_transfer_fee_included_amount(
            params.get_total_deposit_amount()?,
            &ctx.accounts.token_mint,
        )?,
        remaining_accounts.transfer_hook_input,
    )?;

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
    emit_cpi!(EventCreateVestingEscrow {
        vesting_start_time,
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
        update_recipient_mode,
        cancel_mode,
    });
    Ok(())
}
