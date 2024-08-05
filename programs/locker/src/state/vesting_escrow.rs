use crate::*;

use self::safe_math::SafeMath;
use num_enum::{IntoPrimitive, TryFromPrimitive};
use static_assertions::const_assert_eq;

#[derive(Copy, Clone, Debug, PartialEq, Eq, IntoPrimitive, TryFromPrimitive)]
#[repr(u8)]
pub enum UpdateRecipientMode {
    NeitherCreatorOrRecipient, //0
    OnlyCreator,               //1
    OnlyRecipient,             //2
    EitherCreatorAndRecipient, //3
}

#[account(zero_copy)]
#[derive(Default, InitSpace, Debug)]
pub struct VestingEscrow {
    /// recipient address
    pub recipient: Pubkey,
    /// token mint
    pub token_mint: Pubkey,
    /// creator of the escrow
    pub creator: Pubkey,
    /// escrow base key
    pub base: Pubkey,
    /// escrow bump
    pub escrow_bump: u8,
    /// update_recipient_mode
    pub update_recipient_mode: u8,
    /// padding
    pub padding_0: [u8; 6],
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
    /// padding
    pub padding_1: [u8; 8],
    /// buffer
    pub buffer: [u128; 6],
}

const_assert_eq!(VestingEscrow::INIT_SPACE, 288); //  32 * 4 + 8 * 8 + 16 * 6

impl VestingEscrow {
    pub fn init(
        &mut self,
        start_time: u64,
        frequency: u64,
        cliff_amount: u64,
        amount_per_period: u64,
        number_of_period: u64,
        recipient: Pubkey,
        token_mint: Pubkey,
        sender: Pubkey,
        base: Pubkey,
        escrow_bump: u8,
        update_recipient_mode: u8,
    ) {
        self.start_time = start_time;
        self.frequency = frequency;
        self.cliff_amount = cliff_amount;
        self.amount_per_period = amount_per_period;
        self.number_of_period = number_of_period;
        self.recipient = recipient;
        self.token_mint = token_mint;
        self.creator = sender;
        self.base = base;
        self.escrow_bump = escrow_bump;
        self.update_recipient_mode = update_recipient_mode;
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

    pub fn update_recipient(&mut self, new_recipient: Pubkey) {
        self.recipient = new_recipient;
    }
}

#[cfg(test)]
mod escrow_test {
    use super::*;
    use proptest::proptest;

    proptest! {
    #[test]
    fn test_get_max_unlocked_amount(
        start_time in 1..=u64::MAX/2,
        frequency in 1..2592000u64,
        number_of_period in 0..10000u64,
        cliff_amount in 0..u64::MAX / 100,
        amount_per_period in 0..u64::MAX / 10000,
    ) {
        let mut escrow = VestingEscrow::default();
        escrow.start_time = start_time;
        escrow.frequency = frequency;
        escrow.number_of_period = number_of_period;
        escrow.cliff_amount = cliff_amount;
        escrow.amount_per_period = amount_per_period;

        let unlocked_amount = escrow.get_max_unlocked_amount(start_time - 1).unwrap();
        assert_eq!(unlocked_amount, 0);

        let unlocked_amount = escrow.get_max_unlocked_amount(start_time).unwrap();
        assert_eq!(unlocked_amount, cliff_amount);

        let unlocked_amount = escrow
            .get_max_unlocked_amount(start_time + frequency * 1)
            .unwrap();
        assert_eq!(unlocked_amount, cliff_amount + amount_per_period * 1);

        let unlocked_amount = escrow
            .get_max_unlocked_amount(start_time + frequency * number_of_period - 1)
            .unwrap();
        if number_of_period == 0 {
            assert_eq!(
                unlocked_amount,
                0
            );
        } else {
            assert_eq!(unlocked_amount, cliff_amount+ amount_per_period * (number_of_period-1));
        }

        let unlocked_amount = escrow
            .get_max_unlocked_amount(start_time + frequency * number_of_period)
            .unwrap();
        assert_eq!(
            unlocked_amount,
            cliff_amount + amount_per_period * number_of_period
        );

        let unlocked_amount = escrow
            .get_max_unlocked_amount(start_time + frequency * number_of_period + 1)
            .unwrap();
        assert_eq!(
            unlocked_amount,
            cliff_amount + amount_per_period * number_of_period
        );
        }
    }
}