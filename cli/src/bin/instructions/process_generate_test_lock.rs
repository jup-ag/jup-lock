use crate::GenerateTestLockArgs;
use anchor_client::solana_sdk::pubkey::Pubkey;
use csv::Writer;
use rand::Rng;

pub fn process_generate_test_lock(args: &GenerateTestLockArgs) {
    let mut wtr = Writer::from_path(&args.csv_path).unwrap();

    wtr.write_record(&[
        "recipient",
        "vesting_start_time",
        "cliff_time",
        "frequency",
        "cliff_unlock_amount",
        "amount_per_period",
        "number_of_period",
        "update_recipient_mode",
        "cancel_mode",
    ])
    .unwrap();

    let mut thread_rng = rand::thread_rng();

    for _ in 0..args.num_node {
        let recipent = Pubkey::new_unique();
        let vesting_start_time = thread_rng.gen_range(0..1000);
        let cliff_time = vesting_start_time;
        let frequency = thread_rng.gen_range(1..100);
        let cliff_unlock_amount = thread_rng.gen_range(0..1000);
        let amount_per_period = thread_rng.gen_range(1..1000);
        let number_of_period = thread_rng.gen_range(1..1000);
        let update_recipient_mode = thread_rng.gen_range(0..3);
        let cancel_mode = thread_rng.gen_range(0..3);

        wtr.write_record(&[
            recipent.to_string(),
            vesting_start_time.to_string(),
            cliff_time.to_string(),
            frequency.to_string(),
            cliff_unlock_amount.to_string(),
            amount_per_period.to_string(),
            number_of_period.to_string(),
            update_recipient_mode.to_string(),
            cancel_mode.to_string(),
        ])
        .unwrap();
    }

    wtr.flush().unwrap();
}
