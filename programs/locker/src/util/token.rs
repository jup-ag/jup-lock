use anchor_lang::prelude::*;
use anchor_spl::token::InitializeAccount;
use anchor_spl::token_2022::spl_token_2022::{
    extension::StateWithExtensions,
    state::Mint,
};
use anchor_spl::token_2022::spl_token_2022::extension::confidential_transfer::{ConfidentialTransferAccount, ConfidentialTransferMint};
use anchor_spl::token_2022::spl_token_2022::extension::confidential_transfer_fee::{ConfidentialTransferFeeAmount, ConfidentialTransferFeeConfig};
use anchor_spl::token_2022::spl_token_2022::extension::cpi_guard::CpiGuard;
use anchor_spl::token_2022::spl_token_2022::extension::ExtensionType;
use anchor_spl::token_2022::spl_token_2022::extension::interest_bearing_mint::InterestBearingConfig;
use anchor_spl::token_2022::spl_token_2022::extension::non_transferable::{NonTransferable, NonTransferableAccount};
use anchor_spl::token_2022::spl_token_2022::extension::permanent_delegate::PermanentDelegate;
use anchor_spl::token_2022::spl_token_2022::extension::transfer_fee::{TransferFeeAmount, TransferFeeConfig};
use anchor_spl::token_2022::spl_token_2022::extension::transfer_hook::{TransferHook, TransferHookAccount};
use anchor_spl::token_interface::spl_token_2022::{check_spl_token_program_account, extension};
use anchor_spl::token_interface::spl_token_2022::extension::BaseStateWithExtensions;
use crate::LockerError;

pub fn is_supported_token_mint(state_with_extensions_mint: &StateWithExtensions<Mint>) -> bool {
    if let Ok(_) = state_with_extensions_mint.get_extension::<InterestBearingConfig>()  {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<TransferFeeAmount>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<ConfidentialTransferAccount>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<ConfidentialTransferFeeAmount>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<ConfidentialTransferFeeConfig>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<ConfidentialTransferMint>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<PermanentDelegate>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<CpiGuard>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<NonTransferable>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<NonTransferableAccount>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<TransferHook>() {
        return false;
    }

    if let Ok(_) = state_with_extensions_mint.get_extension::<TransferHookAccount>() {
        return false;
    }

    // Supported extensions
    // ExtensionType::MemoTransfer
    // ExtensionType::TransferFeeConfig
    // ExtensionType::ImmutableOwner
    // ExtensionType::MetadataPointer
    // ExtensionType::DefaultAccountState
    // ExtensionType::TokenMetadata


    return true;
}

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


// Memo Extension support
pub fn is_transfer_memo_required(state_with_extensions_mint: &StateWithExtensions<Mint>) -> bool {
    return if let Ok(memo_transfer) = state_with_extensions_mint.get_extension::<extension::memo_transfer::MemoTransfer>() {
        memo_transfer.require_incoming_transfer_memos.into()
    } else {
        false
    }
}