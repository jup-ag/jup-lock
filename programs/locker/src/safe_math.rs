use crate::errors::LockerError;
use anchor_lang::solana_program::msg;
use std::panic::Location;

pub trait SafeMath: Sized {
    fn safe_add(self, rhs: Self) -> Result<Self, LockerError>;
    fn safe_mul(self, rhs: Self) -> Result<Self, LockerError>;
    fn safe_div(self, rhs: Self) -> Result<Self, LockerError>;
    fn safe_sub(self, rhs: Self) -> Result<Self, LockerError>;
}

macro_rules! checked_impl {
    ($t:ty) => {
        impl SafeMath for $t {
            #[inline(always)]
            fn safe_add(self, v: $t) -> Result<$t, LockerError> {
                match self.checked_add(v) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math error thrown at {}:{}", caller.file(), caller.line());
                        Err(LockerError::MathOverflow)
                    }
                }
            }

            #[inline(always)]
            fn safe_sub(self, v: $t) -> Result<$t, LockerError> {
                match self.checked_sub(v) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math error thrown at {}:{}", caller.file(), caller.line());
                        Err(LockerError::MathOverflow)
                    }
                }
            }

            #[inline(always)]
            fn safe_mul(self, v: $t) -> Result<$t, LockerError> {
                match self.checked_mul(v) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math error thrown at {}:{}", caller.file(), caller.line());
                        Err(LockerError::MathOverflow)
                    }
                }
            }

            #[inline(always)]
            fn safe_div(self, v: $t) -> Result<$t, LockerError> {
                match self.checked_div(v) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math error thrown at {}:{}", caller.file(), caller.line());
                        Err(LockerError::MathOverflow)
                    }
                }
            }
        }
    };
}

checked_impl!(u64);
checked_impl!(u128);
