use static_assertions::const_assert_eq;

use crate::*;

#[account(zero_copy)]
#[derive(Default, InitSpace, Debug)]
pub struct VestingEscrowV3 {
    /// token mint
    pub token_mint: Pubkey,
    /// creator of the escrow
    pub creator: Pubkey,
    /// escrow base key
    pub base: Pubkey,
    /// 256 bit merkle root
    pub root: [u8; 32],
    /// cancel mode
    pub cancel_mode: u8,
    /// escrow bump
    pub escrow_bump: u8,
    /// token program flag
    pub token_program_flag: u8,
    /// padding
    pub padding_0: [u8; 5],
    ///
    pub total_deposit_amount: u64,
    ///
    pub total_claimed_amount: u64,
    /// cancelled_at
    pub cancelled_at: u64,
    /// buffer
    pub buffer: [u128; 5],
}

const_assert_eq!(VestingEscrowV3::INIT_SPACE, 240); //

impl VestingEscrowV3 {
    pub fn init(
        &mut self,
        token_mint: Pubkey,
        sender: Pubkey,
        base: Pubkey,
        total_deposit_amount: u64,
        root: [u8; 32],
        cancel_mode: u8,
        escrow_bump: u8,
        token_program_flag: u8,
    ) {
        self.token_mint = token_mint;
        self.creator = sender;
        self.base = base;
        self.total_deposit_amount = total_deposit_amount;
        self.root = root;
        self.cancel_mode = cancel_mode;
        self.escrow_bump = escrow_bump;
        self.token_program_flag = token_program_flag;
    }

    pub fn is_claimed_full_amount(&self) -> Result<bool> {
        Ok(self.total_deposit_amount == self.total_claimed_amount)
    }

    pub fn validate_cancel_actor(&self, signer: Pubkey) -> Result<()> {
        // only creator has permission to cancel escrow v3
        require!(self.cancel_mode == 1, LockerError::NotPermitToDoThisAction);

        require_keys_eq!(signer, self.creator, LockerError::NotPermitToDoThisAction);

        Ok(())
    }
}
