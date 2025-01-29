rpc_url=https://api.devnet.solana.com
keypair_path=
wallet_path=cli/test.csv
token_mint=
vesting_start_time=1728980663
cliff_time=1729067063
frequency=604800
number_of_period=4
update_recipient_mode=0

target/debug/cli --rpc-url $rpc_url --keypair-path $keypair_path initialize-lock-escrow-from-file --wallet-path $wallet_path --token-mint $token_mint --vesting-start-time $vesting_start_time --cliff-time $cliff_time --frequency $frequency --number-of-period $number_of_period --update-recipient-mode $update_recipient_mode