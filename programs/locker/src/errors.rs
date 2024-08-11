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

    #[msg("Not permit to do this action")]
    NotPermitToDoThisAction,

    #[msg("Invalid recipient token account")]
    InvalidRecipientTokenAccount,

    #[msg("Invalid escrow metadata")]
    InvalidEscrowMetadata,

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
