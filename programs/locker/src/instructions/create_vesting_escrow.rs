use crate::safe_math::SafeMath;
use crate::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
#[derive(AnchorSerialize, AnchorDeserialize)]

/// Accounts for [locker::create_vesting_escrow].
pub struct CreateVestingEscrowParameters {
    pub start_time: u64,
    pub frequency: u64,
    pub cliff_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
}

impl CreateVestingEscrowParameters {
    pub fn get_total_deposit_amount(&self) -> Result<u64> {
        let total_amount = self
            .cliff_amount
            .safe_add(self.amount_per_period.safe_mul(self.number_of_period)?)?;
        Ok(total_amount)
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingEscrowCtx<'info> {
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
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(mut)]
    pub sender_token: Box<Account<'info, TokenAccount>>,

    /// CHECK: recipient account
    pub recipient: UncheckedAccount<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    // system program
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vesting_escrow(
    ctx: Context<CreateVestingEscrowCtx>,
    params: &CreateVestingEscrowParameters,
) -> Result<()> {
    let &CreateVestingEscrowParameters {
        start_time,
        frequency,
        cliff_amount,
        amount_per_period,
        number_of_period,
        update_recipient_mode,
    } = params;

    require!(
        UpdateRecipientMode::try_from(update_recipient_mode).is_ok(),
        LockerError::InvalidUpdateRecipientMode,
    );

    require!(frequency != 0, LockerError::FrequencyIsZero);

    let escrow_token = anchor_spl::associated_token::get_associated_token_address(
        &ctx.accounts.escrow.key(),
        &ctx.accounts.sender_token.mint,
    );

    require!(
        escrow_token == ctx.accounts.escrow_token.key(),
        LockerError::InvalidEscrowTokenAddress
    );

    let mut escrow = ctx.accounts.escrow.load_init()?;
    escrow.init(
        start_time,
        frequency,
        cliff_amount,
        amount_per_period,
        number_of_period,
        ctx.accounts.recipient.key(),
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
        *ctx.bumps.get("escrow").unwrap(),
        update_recipient_mode,
    );

    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token.to_account_info(),
                to: ctx.accounts.escrow_token.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        params.get_total_deposit_amount()?,
    )?;

    emit_cpi!(EventCreateVestingEscrow {
        start_time,
        frequency,
        cliff_amount,
        amount_per_period,
        number_of_period,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
        update_recipient_mode,
    });
    Ok(())
}
