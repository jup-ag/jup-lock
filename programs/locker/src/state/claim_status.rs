use crate::*;

#[account]
#[derive(Default, InitSpace, Debug)]
pub struct ClaimStatus {
    pub total_claimed_amount: u64,
    pub total_unlocked_amount: u64,
}
