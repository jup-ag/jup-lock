use crate::*;

#[account]
#[derive(Default, InitSpace, Debug)]
pub struct ClaimStatus {
    pub total_claimed_amount: u64,
    pub current_locked_amount: u64,
    pub latest_claimed_amount: u64,
    pub bump: u8,
}
