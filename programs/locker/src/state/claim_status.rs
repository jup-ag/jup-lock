use crate::*;

use safe_math::SafeMath;
#[account]
#[derive(Default, InitSpace, Debug)]
pub struct ClaimStatus {
    /// total claimed amount of recipient
    pub total_claimed_amount: u64,
    /// escrow address
    pub escrow: Pubkey,
    /// recipient address
    pub recipient: Pubkey,
    /// buffer
    pub buffer: [u128; 5],
}

impl ClaimStatus {
    pub fn accumulate_claimed_amount(&mut self, claimed_amount: u64) -> Result<()> {
        self.total_claimed_amount = self.total_claimed_amount.safe_add(claimed_amount)?;
        Ok(())
    }
}
