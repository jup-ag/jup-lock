use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq)]
pub enum LockerError {
    #[msg("Math operation overflow")]
    MathOverflow,

    #[msg("Frequency is zero")]
    FrequencyIsZero,

    #[msg("Invalid escrow token address")]
    InvalidEscrowTokenAddress,

    #[msg("Invalid update recipient mode")]
    InvalidUpdateRecipientMode,

    #[msg("Invalid cancel mode")]
    InvalidCancelMode,

    #[msg("Not permit to do this action")]
    NotPermitToDoThisAction,

    #[msg("Invalid recipient token account")]
    InvalidRecipientTokenAccount,

    #[msg("Invalid creator token account")]
    InvalidCreatorTokenAccount,

    #[msg("Invalid escrow metadata")]
    InvalidEscrowMetadata,

    #[msg("Invalid vesting start time")]
    InvalidVestingStartTime,

    #[msg("Already cancelled")]
    AlreadyCancelled,

    #[msg("Timestamp is zero")]
    TimestampZero,
}
