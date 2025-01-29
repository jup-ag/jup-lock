use safe_math::SafeMath;
use static_assertions::const_assert_eq;

use crate::*;

#[account(zero_copy)]
#[derive(Default, InitSpace, Debug)]
pub struct RootEscrow {
    /// token mint
    pub token_mint: Pubkey,
    /// creator of the escrow
    pub creator: Pubkey,
    /// escrow base key
    pub base: Pubkey,
    /// 256 bit merkle root
    pub root: [u8; 32],
    /// bump
    pub bump: u8,
    /// token program flag
    pub token_program_flag: u8,
    /// padding
    pub padding_0: [u8; 6],
    /// max claim amount
    pub max_claim_amount: u64,
    /// max escrow
    pub max_escrow: u64,
    /// total funded amount
    pub total_funded_amount: u64,
    /// total escrow created
    pub total_escrow_created: u64,
    /// total distributed amount
    pub total_distribute_amount: u64,
    /// version
    pub version: u64,
    /// padding
    pub padding: u64,
    /// buffer
    pub buffer: [u128; 5],
}

const_assert_eq!(RootEscrow::INIT_SPACE, 272);

impl RootEscrow {
    pub fn init(
        &mut self,
        token_mint: Pubkey,
        creator: Pubkey,
        base: Pubkey,
        max_claim_amount: u64,
        max_escrow: u64,
        root: [u8; 32],
        bump: u8,
        version: u64,
        token_program_flag: u8,
    ) {
        self.token_mint = token_mint;
        self.creator = creator;
        self.base = base;
        self.max_claim_amount = max_claim_amount;
        self.root = root;
        self.bump = bump;
        self.token_program_flag = token_program_flag;
        self.version = version;
        self.max_escrow = max_escrow;
    }

    pub fn get_and_set_fund_amount(&mut self, max_amount: u64) -> Result<u64> {
        let max_amount_should_be_funded =
            self.max_claim_amount.safe_sub(self.total_funded_amount)?;
        let funded_amount = max_amount_should_be_funded.min(max_amount);

        self.total_funded_amount = self.total_funded_amount.safe_add(funded_amount)?;
        Ok(funded_amount)
    }

    pub fn update_new_escrow(&mut self, total_deposit: u64) -> Result<()> {
        self.total_escrow_created = self.total_escrow_created.safe_add(1)?;
        self.total_distribute_amount = self.total_distribute_amount.safe_add(total_deposit)?;
        Ok(())
    }
}
// #[test]
// fn test_size() {
//     println!("{}", RootEscrow::INIT_SPACE)
// }
