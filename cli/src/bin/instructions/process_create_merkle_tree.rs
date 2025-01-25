use crate::*;
use locker::CreateVestingEscrowParameters;
use merkle_tree::csv_entry::CsvEntry;
use merkle_tree::jup_lock_merkle_tree::JupLockMerkleTree;
use std::collections::HashMap;
use std::fs;

fn validate_csv_file(csv_entries: &Vec<CsvEntry>) {
    // no duplicate
    let mut hash_recipient = HashMap::new();
    for val in csv_entries.iter() {
        if hash_recipient.get(&val.recipient).is_some() {
            panic!("{} is duplicated", val.recipient.to_string());
        }
        let params = CreateVestingEscrowParameters {
            vesting_start_time: val.vesting_start_time,
            cliff_time: val.cliff_time,
            frequency: val.frequency,
            cliff_unlock_amount: val.cliff_unlock_amount,
            amount_per_period: val.amount_per_period,
            number_of_period: val.number_of_period,
            update_recipient_mode: val.update_recipient_mode,
            cancel_mode: val.cancel_mode,
        };
        if params.validate().is_err() {
            panic!("{} is invalid params", val.recipient.to_string());
        }
        if params.get_total_deposit_amount().unwrap() == 0 {
            panic!("{} is invalid params", val.recipient.to_string());
        }
        hash_recipient.insert(&val.recipient, true);
    }
}

pub fn process_create_merkle_tree(merkle_tree_args: &CreateMerkleTreeArgs) {
    let csv_entries = CsvEntry::new_from_file(&merkle_tree_args.csv_path).unwrap();
    // validate
    validate_csv_file(&csv_entries);

    // create merkle tree folder if not existed
    fs::create_dir_all(merkle_tree_args.merkle_tree_path.clone()).unwrap();

    // use index as 0
    let merkle_tree = JupLockMerkleTree::new_from_entries(csv_entries, 0).unwrap();

    let base_path = &merkle_tree_args.merkle_tree_path;
    let base_path_clone = base_path.clone();
    let path = base_path_clone.as_path().join(format!("merkle_tree.json"));

    merkle_tree.write_to_file(&path);
}
