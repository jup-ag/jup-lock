use crate::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCtx<'info> {
    #[account(mut, has_one = recipient, has_one = escrow_token)]
    pub escrow: AccountLoader<'info, Escrow>,

    #[account(mut)]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(mut)]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,

    // system program
    pub system_program: Program<'info, System>,
}

pub fn handle_claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
    let current_ts = Clock::get()?.unix_timestamp as u64;
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let claimable_amount = escrow.get_claimable_amount(current_ts)?;

    let amount = claimable_amount.min(max_amount);
    escrow.accumulate_claimed_amount(amount)?;

    let escrow_seeds = escrow_seeds!(escrow);
    anchor_spl::token_2022::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.escrow_token.to_account_info(),
                to: ctx.accounts.recipient_token.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
            },
            &[&escrow_seeds[..]],
        ),
        amount,
        ctx.accounts.token_mint.decimals,
    )?;

    emit!(EventClaim {
        amount,
        current_ts,
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
