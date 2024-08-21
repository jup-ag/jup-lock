use solana_program::pubkey;
use solana_program::pubkey::Pubkey;

#[cfg(feature = "localnet")]
pub const ADMINS: [Pubkey; 1] = [pubkey!("5k2hyrHp5haXrwFCu7Zw1fsyg8r1eBkHy7iF9AMDD324")];

#[cfg(not(feature = "localnet"))]
pub const ADMINS: [Pubkey; 3] = [
    pubkey!("5unTfT2kssBuNvHPY6LbJfJpLqEcdMxGYLWHwShaeTLi"),
    pubkey!("ChSAh3XXTxpp5n2EmgSCm6vVvVPoD1L9VrK3mcQkYz7m"),
    pubkey!("DHLXnJdACTY83yKwnUkeoDjqi4QBbsYGa1v8tJL76ViX"),
];