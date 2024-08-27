use anchor_spl::token::Token;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::util::{calculate_transfer_fee_included_amount, transfer_to_escrow_v2, validate_mint};
use crate::TokenProgramFLag::UseSplToken;
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

    #[account(
        mut,
        associated_token::mint = sender_token.mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(mut)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: recipient account
    pub recipient: UncheckedAccount<'info>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    // system program
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vesting_escrow_v2<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CreateVestingEscrowV2<'info>>,
    params: &CreateVestingEscrowParameters,
) -> Result<()> {
    require!(
        validate_mint(&ctx.accounts.mint).unwrap(),
        LockerError::UnsupportedMint,
    );

    let token_mint_info = ctx.accounts.mint.to_account_info();
    let token_program_flag = if *token_mint_info.owner == Token::id() {
        UseSplToken
    } else {
        TokenProgramFLag::UseToken2022
    };
    params.init_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.recipient.key(),
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
        ctx.bumps.escrow,
        token_program_flag,
    )?;

    transfer_to_escrow_v2(
        &ctx.accounts.sender,
        &ctx.accounts.mint,
        &ctx.accounts.sender_token,
        &ctx.accounts.escrow_token,
        &ctx.accounts.token_program,
        calculate_transfer_fee_included_amount(
            params.get_total_deposit_amount()?,
            &ctx.accounts.mint,
        )?,
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
