use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::LockerError;
use crate::state::*;
use crate::util::ADMINS;

#[derive(Accounts)]
pub struct InitializeTokenBadge<'info> {
    #[account(
        constraint = ADMINS.contains(token_badge_authority.key) == true @ LockerError::Unauthorized
    )]
    pub token_badge_authority: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(init,
    payer = payer,
    seeds = [
    b"token_badge",
    token_mint.key().as_ref(),
    ],
    bump,
    space = TokenBadge::LEN)]
    pub token_badge: Account<'info, TokenBadge>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_token_badge(
    ctx: Context<InitializeTokenBadge>,
) -> Result<()> {
    ctx.accounts.token_badge.initialize(ctx.accounts.token_mint.key());
    Ok(())
}
