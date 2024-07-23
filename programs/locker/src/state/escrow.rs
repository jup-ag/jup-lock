use crate::*;

use self::safe_math::SafeMath;
use static_assertions::const_assert_eq;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct Escrow {
    /// recipient address
    pub recipient: Pubkey,
    /// escrow token address
    pub escrow_token: Pubkey,
    /// creator of the escrow
    pub creator: Pubkey,
    /// escrow base key
    pub base: Pubkey,
    /// escrow bump
    pub escrow_bump: u8,
    /// padding
    pub padding_0: [u8; 7],
    /// start time
    pub start_time: u64,
    /// frequency
    pub frequency: u64,
    /// cliff amount
    pub cliff_amount: u64,
    /// amount per period
    pub amount_per_period: u64,
    /// number of period
    pub number_of_period: u64,
    /// total claimed amount
    pub total_claimed_amount: u64,
    /// buffer
    pub buffer: [u128; 6],
}

const_assert_eq!(std::mem::size_of::<Escrow>(), 32 * 4 + 8 * 7 + 16 * 6); // 280

impl Escrow {
    pub fn init(
        &mut self,
        start_time: u64,
        frequency: u64,
        cliff_amount: u64,
        amount_per_period: u64,
        number_of_period: u64,
        recipient: Pubkey,
        escrow_token: Pubkey,
        sender: Pubkey,
        base: Pubkey,
        escrow_bump: u8,
    ) {
        self.start_time = start_time;
        self.frequency = frequency;
        self.cliff_amount = cliff_amount;
        self.amount_per_period = amount_per_period;
        self.number_of_period = number_of_period;
        self.recipient = recipient;
        self.escrow_token = escrow_token;
        self.creator = sender;
        self.base = base;
        self.escrow_bump = escrow_bump;
    }

    pub fn get_max_unlocked_amount(&self, current_ts: u64) -> Result<u64> {
        if current_ts < self.start_time {
            return Ok(0);
        }
        let period = current_ts
            .safe_sub(self.start_time)?
            .safe_div(self.frequency)?;
        let period = period.min(self.number_of_period);

        let unlocked_amount = self
            .cliff_amount
            .safe_add(period.safe_mul(self.amount_per_period)?)?;

        Ok(unlocked_amount)
    }

    pub fn get_claimable_amount(&self, current_ts: u64) -> Result<u64> {
        let max_unlocked_amount = self.get_max_unlocked_amount(current_ts)?;
        let claimable_amount = max_unlocked_amount.safe_sub(self.total_claimed_amount)?;
        Ok(claimable_amount)
    }

    pub fn accumulate_claimed_amount(&mut self, claimed_amount: u64) -> Result<()> {
        self.total_claimed_amount = self.total_claimed_amount.safe_add(claimed_amount)?;
        Ok(())
    }
}
