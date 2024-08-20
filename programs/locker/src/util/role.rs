use solana_program::pubkey;
use solana_program::pubkey::Pubkey;

pub fn is_authorized(pubkey: &Pubkey) -> bool {
    let guardians: Vec<Pubkey> = vec![
        pubkey!("4U8keyQCV8NFMCevhRJffLawYiUZMyeUrwBjaMcZkGeh"), // soju
        pubkey!("4zvTjdpyr3SAgLeSpCnq4KaHvX2j5SbkwxYydzbfqhRQ"), // zhen
        pubkey!("5unTfT2kssBuNvHPY6LbJfJpLqEcdMxGYLWHwShaeTLi"), // tian
        pubkey!("ChSAh3XXTxpp5n2EmgSCm6vVvVPoD1L9VrK3mcQkYz7m"), // ben
        pubkey!("DHLXnJdACTY83yKwnUkeoDjqi4QBbsYGa1v8tJL76ViX"), // andrew
        #[cfg(feature = "localnet")]
        pubkey!("5k2hyrHp5haXrwFCu7Zw1fsyg8r1eBkHy7iF9AMDD324"), // test
    ];

    if !guardians.contains(pubkey) {
        return false;
    }

    true
}