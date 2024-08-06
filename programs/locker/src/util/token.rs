use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::StateWithExtensions,
    state::Mint,
};
use anchor_spl::token_2022::spl_token_2022::extension::transfer_fee::TransferFeeConfig;
use anchor_spl::token_interface::spl_token_2022::check_spl_token_program_account;
use anchor_spl::token_interface::spl_token_2022::extension::BaseStateWithExtensions;
use crate::LockerError;

pub fn unpack_mint_with_extensions<'a>(
    account_data: &'a [u8],
    token_program_id: &Pubkey,
) -> Result<StateWithExtensions<'a, Mint>> {
    if check_spl_token_program_account(token_program_id).is_err() {
        Err(LockerError::IncorrectTokenProgramId.into())
    } else {
        match StateWithExtensions::<Mint>::unpack(&account_data) {
            Ok(state) => Ok(state),
            Err(_) => Err(LockerError::ParseTokenExtensionsFailure.into())
        }
    }
}

// This function calculate the extra fee amount require to transfer `amount` of token
pub fn fee_amount(amount: u64, state_with_extensions_mint: &StateWithExtensions<Mint>) -> Result<u64> {
    let actual_amount : u64 = if let Ok(transfer_fee_config) = state_with_extensions_mint.get_extension::<TransferFeeConfig>() {
            transfer_fee_config
                .calculate_inverse_epoch_fee(Clock::get()?.epoch, amount)
                .ok_or(LockerError::TransferFeeCalculationFailure)?
    } else {
        0
    };

    Ok(actual_amount)
}