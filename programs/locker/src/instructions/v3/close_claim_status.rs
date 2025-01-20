use crate::*;

/// Accounts for [locker::close_claim_status].
#[derive(Accounts)]
#[event_cpi]
pub struct CloseClaimStatus<'info> {
    /// Claim status
    #[account(
        mut,
        has_one = recipient,
        has_one = escrow,
        close = rent_receiver
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    #[account(constraint = escrow.load()?.cancelled_at > 0 @ LockerError::EscrowNotCancelled)]
    pub escrow: AccountLoader<'info, VestingEscrowV3>,

    /// CHECKED: The system account will receive the rent
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    /// recipient
    #[account(mut)]
    recipient: Signer<'info>,
}

pub fn handle_close_claim_status<'c: 'info, 'info>(
    _ctx: Context<'_, '_, 'c, 'info, CloseClaimStatus<'info>>,
) -> Result<()> {
    Ok(())
}
