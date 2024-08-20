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

    #[msg("Not permit to do this action")]
    NotPermitToDoThisAction,

    #[msg("Invalid recipient token account")]
    InvalidRecipientTokenAccount,

    #[msg("Invalid escrow metadata")]
    InvalidEscrowMetadata,

    #[msg("Invalid vesting start time")]
    InvalidVestingStartTime,

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

    #[msg("Invalid remaining accounts")]
    InvalidRemainingAccountSlice,

    #[msg("Insufficient remaining accounts")]
    InsufficientRemainingAccounts,

    #[msg("Same accounts type is provided more than once")]
    DuplicatedRemainingAccountTypes,

    #[msg("Unable to call transfer hook without extra accounts")]
    NoTransferHookProgram,
}
