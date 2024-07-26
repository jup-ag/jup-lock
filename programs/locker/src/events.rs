use anchor_lang::prelude::*;

#[event]
pub struct EventCreateVestingPlan {
    pub start_time: u64,
    pub frequency: u64,
    pub cliff_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub recipient: Pubkey,
    pub escrow: Pubkey,
}

#[event]
pub struct EventClaim {
    pub amount: u64,
    pub current_ts: u64,
    pub escrow: Pubkey,
}

#[event]
pub struct EventUpdateRecipient {
    pub escrow: Pubkey,
    pub old_recipient: Pubkey,
    pub new_recipient: Pubkey,
    pub signer: Pubkey,
}
