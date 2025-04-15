use std::str::FromStr;

use crate::csv_entry::CsvEntry;
use anchor_lang::solana_program::{
    hash::{hashv, Hash},
    pubkey::Pubkey,
};
use serde::{Deserialize, Serialize};

/// Represents the claim information for an account.
#[derive(Debug, Clone, Eq, Hash, PartialEq, Serialize, Deserialize)]
pub struct TreeNode {
    /// Pubkey of the claimant; will be responsible for signing the claim
    pub recipient: Pubkey,
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub cancel_mode: u8,
    pub proof: Option<Vec<[u8; 32]>>,
}

impl TreeNode {
    pub fn hash(&self) -> Hash {
        hashv(&[
            &self.recipient.to_bytes(),
            &self.vesting_start_time.to_le_bytes(),
            &self.cliff_time.to_le_bytes(),
            &self.frequency.to_le_bytes(),
            &self.cliff_unlock_amount.to_le_bytes(),
            &self.amount_per_period.to_le_bytes(),
            &self.number_of_period.to_le_bytes(),
            &self.update_recipient_mode.to_le_bytes(),
            &self.cancel_mode.to_le_bytes(),
        ])
    }
    /// Return total amount for this recipient
    pub fn total_amount(&self) -> u64 {
        let total_amount = self
            .cliff_unlock_amount
            .checked_add(
                self.amount_per_period
                    .checked_mul(self.number_of_period)
                    .unwrap(),
            )
            .unwrap();
        total_amount
    }
}

impl TreeNode {
    pub fn from_csv(entry: CsvEntry) -> Self {
        let node = Self {
            recipient: Pubkey::from_str(&entry.recipient.as_str()).unwrap(),
            vesting_start_time: entry.vesting_start_time,
            cliff_time: entry.cliff_time,
            frequency: entry.frequency,
            cliff_unlock_amount: entry.cliff_unlock_amount,
            amount_per_period: entry.amount_per_period,
            number_of_period: entry.number_of_period,
            update_recipient_mode: entry.update_recipient_mode,
            cancel_mode: entry.cancel_mode,
            proof: None,
        };
        node
    }
}
