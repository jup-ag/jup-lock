use std::{fs::File, path::PathBuf, result};

use serde::{Deserialize, Serialize};

use crate::error::MerkleTreeError;

pub type Result<T> = result::Result<T, MerkleTreeError>;

/// Represents a single entry in a CSV
#[derive(Debug, Clone, Eq, Hash, PartialEq, Serialize, Deserialize)]
pub struct CsvEntry {
    pub recipient: String,
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub cancel_mode: u8,
}

impl CsvEntry {
    pub fn new_from_file(path: &PathBuf) -> Result<Vec<Self>> {
        let file = File::open(path)?;
        let mut rdr = csv::Reader::from_reader(file);

        let mut entries = Vec::new();
        for result in rdr.deserialize() {
            let record: CsvEntry = result.unwrap();
            entries.push(record);
        }

        Ok(entries)
    }
}
