use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct TokenBadge {
    pub token_mint: Pubkey, // 32
}

impl TokenBadge {
    pub const LEN: usize = 8 + 32;

    pub fn initialize(
        &mut self,
        token_mint: Pubkey,
    ) {
        self.token_mint = token_mint;
    }
}