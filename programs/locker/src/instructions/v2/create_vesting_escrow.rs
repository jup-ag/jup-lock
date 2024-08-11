use crate::util::token::{self, fee_amount};
use crate::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use anchor_spl::memo;
use anchor_spl::memo::{BuildMemo, Memo};
use crate::util::{is_supported_token_mint, is_transfer_memo_required};

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

    #[account(mut)]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(mut)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub memo_program: Program<'info, Memo>,

    /// CHECK: recipient account
    pub recipient: UncheckedAccount<'info>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    // system program
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vesting_escrow_v2(
    ctx: Context<CreateVestingEscrowV2>,
    params: &CreateVestingEscrowParameters,
    memo: &str,
) -> Result<()> {
    require!(
        ctx.accounts.mint.key() == ctx.accounts.sender_token.mint,
        LockerError::InvalidMintAccount,
    );

    let &CreateVestingEscrowParameters {
        start_time,
        frequency,
        initial_unlock_amount,
        amount_per_period,
        number_of_period,
        update_recipient_mode,
    } = params;

    require!(
        UpdateRecipientMode::try_from(update_recipient_mode).is_ok(),
        LockerError::InvalidUpdateRecipientMode,
    );

    require!(frequency != 0, LockerError::FrequencyIsZero);

    let escrow_token = anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &ctx.accounts.escrow.key(),
        &ctx.accounts.sender_token.mint,
        &ctx.accounts.token_program.key,
    );

    require!(
        escrow_token == ctx.accounts.escrow_token.key(),
        LockerError::InvalidEscrowTokenAddress
    );

    let mut escrow = ctx.accounts.escrow.load_init()?;
    escrow.init(
        start_time,
        frequency,
        initial_unlock_amount,
        amount_per_period,
        number_of_period,
        ctx.accounts.recipient.key(),
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
        ctx.bumps.escrow,
        update_recipient_mode,
    );

    let token_mint_info = ctx.accounts.mint.to_account_info();
    let token_mint_data = token_mint_info.data.borrow();
    let token_mint_unpacked =
        token::unpack_mint_with_extensions(&token_mint_data, &ctx.accounts.token_program.key)?;
    require!(
        is_supported_token_mint(&token_mint_unpacked),
        LockerError::UnsupportedMint
    );

    if is_transfer_memo_required(&token_mint_unpacked) {
        memo::build_memo(
            CpiContext::new(
                ctx.accounts.memo_program.to_account_info(),
                BuildMemo {}
            ),
            memo.as_bytes()
        )?;
    }

    let amount = params.get_total_deposit_amount()?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.sender_token.to_account_info(),
                to: ctx.accounts.escrow_token.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        // The total fee transfer should be counted twice,
        //  one for the initial deposit
        //  and everytime users withdraw
        amount.saturating_add(fee_amount(
            amount.saturating_add(fee_amount(amount, &token_mint_unpacked)?),
            &token_mint_unpacked,
        )?),
        ctx.accounts.mint.decimals,
    )?;

    emit_cpi!(EventCreateVestingEscrow {
        start_time,
        frequency,
        initial_unlock_amount,
        amount_per_period,
        number_of_period,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
        update_recipient_mode,
    });
    Ok(())
}
