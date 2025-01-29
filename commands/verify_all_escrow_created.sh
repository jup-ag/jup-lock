rpc_url=http://localhost:8899
program_id=2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg

base=CwmZq21KvTYFiWkuiw2KzEiJumGehgExLvqCYBgerPJX
mint=CnvihecwgFZkYzktcdKaPvrMGyP2s5KEMskbs19YYhzB
merkle_tree_path=/Users/andrewnguyen/Documents/solana/jup-lock/commands/trash/merkle_tree.json
target/debug/cli --rpc-url $rpc_url --program-id $program_id verify-all-escrow-created --merkle-tree-path $merkle_tree_path --base $base --mint $mint