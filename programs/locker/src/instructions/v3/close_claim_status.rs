use crate::*;
use anchor_lang::system_program;
use util::{account_info_ref_lifetime_shortener, close};

/// Accounts for [locker::close_claim_status].
#[derive(Accounts)]
#[event_cpi]
pub struct CloseClaimStatus<'info> {
    /// Claim status
    #[account(
        mut,
        has_one = recipient,
        has_one = escrow
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// CHECK: this account use to verify escrow cancelled or closed
    pub escrow: UncheckedAccount<'info>,

    /// CHECKED: The Token Account will receive the rent
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    /// recipient
    #[account(mut)]
    recipient: Signer<'info>,
}

pub fn handle_close_claim_status<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CloseClaimStatus<'info>>,
) -> Result<()> {
    // only allow close claim status if escrow is cancel
    let mut is_close =
        ctx.accounts.escrow.owner == &system_program::ID && ctx.accounts.escrow.data_len() == 0;

    if !is_close {
        let escrow_info = &ctx.accounts.escrow.to_account_info();

        let escrow: AccountLoader<VestingEscrowV3> = AccountLoader::try_from_unchecked(
            &ctx.program_id,
            account_info_ref_lifetime_shortener(&escrow_info),
        )?;

        is_close = escrow.load()?.cancelled_at > 0;
    }

    if is_close {
        close(
            ctx.accounts.claim_status.to_account_info(),
            ctx.accounts.rent_receiver.to_account_info(),
        )?;
    }

    emit_cpi!(EventCloseClaimStatus {
        escrow: ctx.accounts.escrow.key(),
        recipient: ctx.accounts.recipient.key(),
        rent_receiver: ctx.accounts.rent_receiver.key()
    });
    Ok(())
}
