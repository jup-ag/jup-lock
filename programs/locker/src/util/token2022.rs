use anchor_lang::prelude::*;
use anchor_spl::memo;
use anchor_spl::memo::{BuildMemo, Memo};
use anchor_spl::token::Token;
use anchor_spl::token_2022::spl_token_2022::extension::transfer_fee::{
    TransferFee, TransferFeeConfig, MAX_FEE_BASIS_POINTS,
};
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{self, StateWithExtensions},
};
use anchor_spl::token_interface::spl_token_2022::extension::BaseStateWithExtensions;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{LockerError, VestingEscrow};

const ONE_IN_BASIS_POINTS: u128 = MAX_FEE_BASIS_POINTS as u128;

#[derive(Clone, Copy)]
pub struct MemoTransferContext<'a, 'info> {
    pub memo_program: &'a Program<'info, Memo>,
    pub memo: &'static [u8],
}

pub fn transfer_to_escrow_v2<'a, 'c: 'info, 'info>(
    sender: &'a Signer<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    sender_token: &InterfaceAccount<'info, TokenAccount>,
    escrow_token: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &sender_token.key(),
        &token_mint.key(),   // mint
        &escrow_token.key(), // to
        sender.key,          // authority
        &[],
        // The transfer amount should include fee
        amount,
        token_mint.decimals,
    )?;

    let account_infos = vec![
        token_program.to_account_info(),
        sender_token.to_account_info(),
        token_mint.to_account_info(),
        escrow_token.to_account_info(),
        sender.to_account_info(),
    ];

    solana_program::program::invoke(&instruction, &account_infos)?;

    Ok(())
}

pub fn transfer_to_user_v2<'c: 'info, 'info>(
    escrow: &AccountLoader<'info, VestingEscrow>,
    token_mint: &InterfaceAccount<'info, Mint>,
    escrow_token: &InterfaceAccount<'info, TokenAccount>,
    recipient_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    memo_transfer_context: Option<MemoTransferContext<'_, 'info>>,
    amount: u64,
) -> Result<()> {
    let escrow_state = escrow.load()?;
    let escrow_seeds = escrow_seeds!(escrow_state);

    if let Some(memo_ctx) = memo_transfer_context {
        if is_transfer_memo_required(&recipient_account)? {
            memo::build_memo(
                CpiContext::new(memo_ctx.memo_program.to_account_info(), BuildMemo {}),
                memo_ctx.memo,
            )?;
        }
    }

    let instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &escrow_token.key(),
        &token_mint.key(),        // mint
        &recipient_account.key(), // to
        &escrow.key(),            // authority
        &[],
        amount,
        token_mint.decimals,
    )?;

    let account_infos = vec![
        escrow_token.to_account_info(),
        token_mint.to_account_info(),
        recipient_account.to_account_info(),
        escrow.to_account_info(),
    ];

    solana_program::program::invoke_signed(&instruction, &account_infos, &[&escrow_seeds[..]])?;

    Ok(())
}

pub fn validate_mint(token_mint: &InterfaceAccount<Mint>) -> Result<bool> {
    let token_mint_info = token_mint.to_account_info();

    // mint owned by Token Program is supported by default
    if *token_mint_info.owner == Token::id() {
        return Ok(true);
    }

    // seems like other programs don't like to support token-2022 native_mint :)
    if spl_token_2022::native_mint::check_id(&token_mint.key()) {
        return Ok(false);
    }

    // reject if mint has freeze_authority, unless its token badge is initialized
    if token_mint.freeze_authority.is_some() {
        return Ok(false);
    }

    let token_mint_data = token_mint_info.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;

    let extensions = token_mint_unpacked.get_extension_types()?;
    for extension in extensions {
        match extension {
            // supported
            extension::ExtensionType::TransferFeeConfig => {}
            extension::ExtensionType::TokenMetadata => {}
            extension::ExtensionType::MetadataPointer => {}
            // mint has unknown or unsupported extensions
            _ => {
                return Ok(false);
            }
        }
    }

    return Ok(true);
}

// This function calculate the pre amount (with fee) require to transfer `amount` of token
pub fn calculate_transfer_fee_included_amount(
    amount: u64,
    token_mint: &InterfaceAccount<Mint>,
) -> Result<u64> {
    let mint_info = token_mint.to_account_info();
    if *mint_info.owner == Token::id() {
        return Ok(amount);
    }

    let token_mint_data = mint_info.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    let actual_amount: u64 =
        if let Ok(transfer_fee_config) = token_mint_unpacked.get_extension::<TransferFeeConfig>() {
            let transfer_fee = transfer_fee_config.get_epoch_fee(Clock::get()?.epoch);
            calculate_pre_fee_amount(transfer_fee, amount)
                .ok_or(LockerError::TransferFeeCalculationFailure)?
        } else {
            amount
        };

    Ok(actual_amount)
}

// Memo Extension support
pub fn is_transfer_memo_required(token_account: &InterfaceAccount<TokenAccount>) -> Result<bool> {
    let token_account_info = token_account.to_account_info();
    if *token_account_info.owner == Token::id() {
        return Ok(false);
    }

    let token_account_data = token_account_info.try_borrow_data()?;
    let token_account_unpacked =
        StateWithExtensions::<spl_token_2022::state::Account>::unpack(&token_account_data)?;
    let extension =
        token_account_unpacked.get_extension::<extension::memo_transfer::MemoTransfer>();

    return if let Ok(memo_transfer) = extension {
        Ok(memo_transfer.require_incoming_transfer_memos.into())
    } else {
        Ok(false)
    };
}

pub fn calculate_pre_fee_amount(transfer_fee: &TransferFee, post_fee_amount: u64) -> Option<u64> {
    if post_fee_amount == 0 {
        return Some(0);
    }
    let maximum_fee = u64::from(transfer_fee.maximum_fee);
    let transfer_fee_basis_points = u16::from(transfer_fee.transfer_fee_basis_points) as u128;
    if transfer_fee_basis_points == 0 {
        Some(post_fee_amount)
    } else if transfer_fee_basis_points == ONE_IN_BASIS_POINTS {
        Some(maximum_fee.checked_add(post_fee_amount)?)
    } else {
        let numerator = (post_fee_amount as u128).checked_mul(ONE_IN_BASIS_POINTS)?;
        let denominator = ONE_IN_BASIS_POINTS.checked_sub(transfer_fee_basis_points)?;
        // let raw_pre_fee_amount = ceil_div(numerator, denominator)?;
        let raw_pre_fee_amount = numerator
            .checked_add(ONE_IN_BASIS_POINTS)?
            .checked_sub(1)?
            .checked_div(denominator)?;

        if raw_pre_fee_amount.checked_sub(post_fee_amount as u128)? >= maximum_fee as u128 {
            post_fee_amount.checked_add(maximum_fee)
        } else {
            // should return `None` if `pre_fee_amount` overflows
            u64::try_from(raw_pre_fee_amount).ok()
        }
    }
}

/// Calculate the fee that would produce the given output
pub fn calculate_inverse_fee(transfer_fee: &TransferFee, post_fee_amount: u64) -> Option<u64> {
    let pre_fee_amount = calculate_pre_fee_amount(&transfer_fee, post_fee_amount)?;
    transfer_fee.calculate_fee(pre_fee_amount)
}

#[cfg(test)]
mod token2022_tests {
    use proptest::prelude::*;
    use spl_pod::primitives::{PodU16, PodU64};

    use super::*;

    const MAX_FEE_BASIS_POINTS: u16 = 100;
    proptest! {
        #[test]
        fn inverse_fee_relationship(
            transfer_fee_basis_points in 0u16..MAX_FEE_BASIS_POINTS,
            maximum_fee in u64::MIN..=u64::MAX,
            amount_in in 0..=u64::MAX
        ) {
            let transfer_fee = TransferFee {
                epoch: PodU64::from(0),
                maximum_fee: PodU64::from(maximum_fee),
                transfer_fee_basis_points: PodU16::from(transfer_fee_basis_points),
            };
            let fee = transfer_fee.calculate_fee(amount_in).unwrap();
            let amount_out = amount_in.checked_sub(fee).unwrap();
            let fee_exact_out = calculate_inverse_fee(&transfer_fee, amount_out).unwrap();
            assert!(fee_exact_out >= fee);
            if fee_exact_out - fee > 0 {
                println!("dif {} {} {} {} {}",fee_exact_out - fee, fee, fee_exact_out, maximum_fee, amount_in);
            }

        }
    }
}