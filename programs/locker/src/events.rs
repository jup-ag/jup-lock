use anchor_lang::prelude::*;

#[event]
pub struct EventCreateVestingEscrow {
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub cancel_mode: u8,
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
pub struct EventUpdateVestingEscrowRecipient {
    pub escrow: Pubkey,
    pub old_recipient: Pubkey,
    pub new_recipient: Pubkey,
    pub signer: Pubkey,
}

#[event]
pub struct EventCancelVestingEscrow {
    pub escrow: Pubkey,
    pub signer: Pubkey,
    pub claimable_amount: u64,
    pub remaining_amount: u64,
    pub cancelled_at: u64,
}

#[event]
pub struct EventCloseVestingEscrow {
    pub escrow: Pubkey,
}
