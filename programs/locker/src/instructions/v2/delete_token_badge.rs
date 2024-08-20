use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::LockerError;
use crate::state::*;
use crate::util::is_authorized;

#[derive(Accounts)]
pub struct DeleteTokenBadge<'info> {
    pub token_badge_authority: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [
        b"token_badge",
        token_mint.key().as_ref(),
        ],
        bump,
        close = receiver
    )]
    pub token_badge: Account<'info, TokenBadge>,

    /// CHECK: safe, for receiving rent only
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,
}

pub fn handle_delete_token_badge(
    ctx: Context<DeleteTokenBadge>,
) -> Result<()> {
    require!(
        is_authorized(ctx.accounts.token_badge_authority.key),
        LockerError::Unauthorized
    );

    Ok(())
}
