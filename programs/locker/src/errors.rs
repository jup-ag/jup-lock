use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq)]
pub enum LockerError {
    #[msg("Math operation overflow")]
    MathOverflow,

    #[msg("Frequency is zero")]
    FrequencyIsZero,

    #[msg("Unauthorized")]
    Unauthorized,

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

    #[msg("Cancelled timestamp is zero")]
    CancelledAtIsZero,

    #[msg("Invalid mint account")]
    InvalidMintAccount,

    #[msg("Invalid token programId")]
    IncorrectTokenProgramId,

    #[msg("Parse token extensions failure")]
    ParseTokenExtensionsFailure,

    #[msg("Calculate transfer fee failure")]
    TransferFeeCalculationFailure,

    #[msg("Unsupported mint")]
    UnsupportedMint,
}
