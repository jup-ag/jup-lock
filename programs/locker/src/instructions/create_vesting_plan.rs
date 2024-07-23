use crate::safe_math::SafeMath;
use crate::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateVestingPlanParameters {
    pub start_time: u64,
    pub frequency: u64,
    pub cliff_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
}

impl CreateVestingPlanParameters {
    pub fn get_total_deposit_amount(&self) -> Result<u64> {
        let total_amount = self
            .cliff_amount
            .safe_add(self.amount_per_period.safe_mul(self.number_of_period)?)?;
        Ok(total_amount)
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingPlanCtx<'info> {
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
        space = 8 + Escrow::INIT_SPACE
    )]
    pub escrow: AccountLoader<'info, Escrow>,

    #[account(
        init,
        payer = sender,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program,
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(mut)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: recipient account
    pub recipient: UncheckedAccount<'info>,

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,

    // system program
    pub system_program: Program<'info, System>,

    /// Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_create_vesting_plan(
    ctx: Context<CreateVestingPlanCtx>,
    params: &CreateVestingPlanParameters,
) -> Result<()> {
    let &CreateVestingPlanParameters {
        start_time,
        frequency,
        cliff_amount,
        amount_per_period,
        number_of_period,
    } = params;

    require!(frequency != 0, LockerError::FrequencyIsZero);

    let mut escrow = ctx.accounts.escrow.load_init()?;
    escrow.init(
        start_time,
        frequency,
        cliff_amount,
        amount_per_period,
        number_of_period,
        ctx.accounts.recipient.key(),
        ctx.accounts.escrow_token.key(),
        ctx.accounts.base.key(),
        *ctx.bumps.get("escrow").unwrap(),
    );

    anchor_spl::token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.sender_token.to_account_info(),
                to: ctx.accounts.escrow_token.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
            },
        ),
        params.get_total_deposit_amount()?,
        ctx.accounts.token_mint.decimals,
    )?;

    emit!(EventCreateVestingPlan {
        start_time,
        frequency,
        cliff_amount,
        amount_per_period,
        number_of_period,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
