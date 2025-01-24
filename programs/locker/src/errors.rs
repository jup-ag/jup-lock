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

    #[msg("Cancelled timestamp is zero")]
    CancelledAtIsZero,

    #[msg("Invalid token program ID")]
    IncorrectTokenProgramId,

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

    #[msg("Missing remaining accounts for transfer hook.")]
    NoTransferHookProgram,

    #[msg("Claiming is not finished")]
    ClaimingIsNotFinished,

    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,

    #[msg("Escrow is not cancelled")]
    EscrowNotCancelled,

    #[msg("Amount is zero")]
    AmountIsZero,
}
