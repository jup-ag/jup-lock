use crate::*;

use safe_math::SafeMath;
#[account]
#[derive(Default, InitSpace, Debug)]
pub struct ClaimStatus {
    pub total_claimed_amount: u64,
}

impl ClaimStatus {
    pub fn accumulate_claimed_amount(&mut self, claimed_amount: u64) -> Result<()> {
        self.total_claimed_amount = self.total_claimed_amount.safe_add(claimed_amount)?;
        Ok(())
    }
}
