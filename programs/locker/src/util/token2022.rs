use anchor_lang::{prelude::*, solana_program};
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
use anchor_spl::token_interface::{
    harvest_withheld_tokens_to_mint, HarvestWithheldTokensToMint, Mint, TokenAccount,
    TokenInterface,
};

use crate::{LockerError, RootEscrow, VestingEscrow};

#[derive(Clone, Copy)]
pub struct MemoTransferContext<'a, 'info> {
    pub memo_program: &'a Program<'info, Memo>,
    pub memo: &'static [u8],
}

pub fn transfer_to_escrow2<'a, 'c: 'info, 'info>(
    sender: &'a Signer<'info>,
    token_mint: &InterfaceAccount<'info, Mint>,
    sender_token: &InterfaceAccount<'info, TokenAccount>,
    escrow_token: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    transfer_hook_accounts: Option<&'c [AccountInfo<'info>]>,
) -> Result<()> {
    let mut instruction = spl_token_2022::instruction::transfer_checked(
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

    let mut account_infos = vec![
        sender_token.to_account_info(),
        token_mint.to_account_info(),
        escrow_token.to_account_info(),
        sender.to_account_info(),
    ];

    // TransferHook extension
    if let Some(hook_program_id) = get_transfer_hook_program_id(token_mint)? {
        let Some(transfer_hook_accounts) = transfer_hook_accounts else {
            return Err(LockerError::NoTransferHookProgram.into());
        };

        spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi(
            &mut instruction,
            &mut account_infos,
            &hook_program_id,
            sender_token.to_account_info(),
            token_mint.to_account_info(),
            escrow_token.to_account_info(),
            sender.to_account_info(),
            amount,
            transfer_hook_accounts,
        )?;
    } else {
        require!(
            transfer_hook_accounts.is_none(),
            LockerError::NoTransferHookProgram
        );
    }

    solana_program::program::invoke(&instruction, &account_infos)?;

    Ok(())
}

pub fn transfer_to_user2<'c: 'info, 'info>(
    escrow: &AccountLoader<'info, VestingEscrow>,
    token_mint: &InterfaceAccount<'info, Mint>,
    escrow_token: &AccountInfo<'info>,
    recipient_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    memo_transfer_context: Option<MemoTransferContext<'_, 'info>>,
    amount: u64,
    transfer_hook_accounts: Option<&'c [AccountInfo<'info>]>,
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

    let mut instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &escrow_token.key(),
        &token_mint.key(),        // mint
        &recipient_account.key(), // to
        &escrow.key(),            // authority
        &[],
        amount,
        token_mint.decimals,
    )?;

    let mut account_infos = vec![
        escrow_token.to_account_info(),
        token_mint.to_account_info(),
        recipient_account.to_account_info(),
        escrow.to_account_info(),
    ];

    // TransferHook extension
    if let Some(hook_program_id) = get_transfer_hook_program_id(token_mint)? {
        let Some(transfer_hook_accounts) = transfer_hook_accounts else {
            return Err(LockerError::NoTransferHookProgram.into());
        };

        spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi(
            &mut instruction,
            &mut account_infos,
            &hook_program_id,
            escrow_token.to_account_info(),
            token_mint.to_account_info(),
            recipient_account.to_account_info(),
            escrow.to_account_info(),
            amount,
            transfer_hook_accounts,
        )?;
    } else {
        require!(
            transfer_hook_accounts.is_none(),
            LockerError::NoTransferHookProgram
        );
    }

    solana_program::program::invoke_signed(&instruction, &account_infos, &[&escrow_seeds[..]])?;

    Ok(())
}

pub fn transfer_from_root_escrow<'c: 'info, 'info>(
    root_escrow: &AccountLoader<'info, RootEscrow>,
    token_mint: &InterfaceAccount<'info, Mint>,
    escrow_token: &AccountInfo<'info>,
    recipient_account: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    transfer_hook_accounts: Option<&'c [AccountInfo<'info>]>,
) -> Result<()> {
    let root_escrow_state = root_escrow.load()?;
    let root_escrow_seeds = root_escrow_seeds!(root_escrow_state);

    let mut instruction = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        &escrow_token.key(),
        &token_mint.key(),        // mint
        &recipient_account.key(), // to
        &root_escrow.key(),       // authority
        &[],
        amount,
        token_mint.decimals,
    )?;

    let mut account_infos = vec![
        escrow_token.to_account_info(),
        token_mint.to_account_info(),
        recipient_account.to_account_info(),
        root_escrow.to_account_info(),
    ];

    // TransferHook extension
    if let Some(hook_program_id) = get_transfer_hook_program_id(token_mint)? {
        let Some(transfer_hook_accounts) = transfer_hook_accounts else {
            return Err(LockerError::NoTransferHookProgram.into());
        };

        spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi(
            &mut instruction,
            &mut account_infos,
            &hook_program_id,
            escrow_token.to_account_info(),
            token_mint.to_account_info(),
            recipient_account.to_account_info(),
            root_escrow.to_account_info(),
            amount,
            transfer_hook_accounts,
        )?;
    } else {
        require!(
            transfer_hook_accounts.is_none(),
            LockerError::NoTransferHookProgram
        );
    }

    solana_program::program::invoke_signed(
        &instruction,
        &account_infos,
        &[&root_escrow_seeds[..]],
    )?;

    Ok(())
}

pub fn validate_mint(
    token_mint: &InterfaceAccount<Mint>,
    is_allow_transfer_fee: bool,
) -> Result<()> {
    let token_mint_info = token_mint.to_account_info();

    // mint owned by Token Program is supported by default
    if *token_mint_info.owner == Token::id() {
        return Ok(());
    }

    let token_mint_data = token_mint_info.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;

    let extensions = token_mint_unpacked.get_extension_types()?;
    for extension in extensions {
        match extension {
            // supported
            extension::ExtensionType::TransferFeeConfig => {
                require!(is_allow_transfer_fee, LockerError::UnsupportedMint);
            }
            extension::ExtensionType::TokenMetadata => {}
            extension::ExtensionType::MetadataPointer => {}
            // partially supported
            extension::ExtensionType::ConfidentialTransferMint => {
                // Supported, but non-confidential transfer only
            }
            extension::ExtensionType::ConfidentialTransferFeeConfig => {
                // Supported, but non-confidential transfer only
                require!(is_allow_transfer_fee, LockerError::UnsupportedMint);
            }
            // supported with risks that creator should be aware of
            extension::ExtensionType::PermanentDelegate => {}
            extension::ExtensionType::TransferHook => {}
            extension::ExtensionType::MintCloseAuthority => {}
            extension::ExtensionType::DefaultAccountState => {}
            extension::ExtensionType::GroupMemberPointer => {}
            extension::ExtensionType::GroupPointer => {}
            // Not stable yet to support
            // extension::ExtensionType::TokenGroup => {}
            // extension::ExtensionType::TokenGroupMember => {}
            // mint has unknown or unsupported extensions
            _ => {
                return Err(LockerError::UnsupportedMint.into());
            }
        }
    }

    Ok(())
}
fn get_epoch_transfer_fee<'info>(
    token_mint: &InterfaceAccount<'info, Mint>,
) -> Result<Option<TransferFee>> {
    let token_mint_info = token_mint.to_account_info();
    if *token_mint_info.owner == Token::id() {
        return Ok(None);
    }

    let token_mint_data = token_mint_info.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    if let Ok(transfer_fee_config) =
        token_mint_unpacked.get_extension::<extension::transfer_fee::TransferFeeConfig>()
    {
        let epoch = Clock::get()?.epoch;
        return Ok(Some(transfer_fee_config.get_epoch_fee(epoch).clone()));
    }

    Ok(None)
}
#[derive(Debug)]
pub struct TransferFeeIncludedAmount {
    pub amount: u64,
    pub transfer_fee: u64,
}
pub fn calculate_transfer_fee_included_amount<'info>(
    transfer_fee_excluded_amount: u64,
    token_mint: &InterfaceAccount<'info, Mint>,
) -> Result<u64> {
    if transfer_fee_excluded_amount == 0 {
        return Ok(0);
    }

    if let Some(epoch_transfer_fee) = get_epoch_transfer_fee(token_mint)? {
        let transfer_fee: u64 =
            if u16::from(epoch_transfer_fee.transfer_fee_basis_points) == MAX_FEE_BASIS_POINTS {
                // edge-case: if transfer fee rate is 100%, current SPL implementation returns 0 as inverse fee.
                // https://github.com/solana-labs/solana-program-library/blob/fe1ac9a2c4e5d85962b78c3fc6aaf028461e9026/token/program-2022/src/extension/transfer_fee/mod.rs#L95

                // But even if transfer fee is 100%, we can use maximum_fee as transfer fee.
                // if transfer_fee_excluded_amount + maximum_fee > u64 max, the following checked_add should fail.
                u64::from(epoch_transfer_fee.maximum_fee)
            } else {
                epoch_transfer_fee
                    .calculate_inverse_fee(transfer_fee_excluded_amount)
                    .ok_or(LockerError::MathOverflow)?
            };

        let transfer_fee_included_amount = transfer_fee_excluded_amount
            .checked_add(transfer_fee)
            .ok_or(LockerError::MathOverflow)?;

        // verify transfer fee calculation for safety
        let transfer_fee_verification = epoch_transfer_fee
            .calculate_fee(transfer_fee_included_amount)
            .unwrap();
        if transfer_fee != transfer_fee_verification {
            // We believe this should never happen
            return Err(LockerError::MathOverflow.into());
        }

        return Ok(transfer_fee_included_amount);
    }

    Ok(transfer_fee_excluded_amount)
}

pub fn harvest_fees<'c: 'info, 'info>(
    token_program_id: &Interface<'info, TokenInterface>,
    token_account: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
) -> Result<()> {
    let mint_info = mint.to_account_info();
    if mint_info.owner.key() == Token::id() {
        return Result::Ok(());
    }

    let token_mint_data = mint_info.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    let mut is_harvestable = false;
    if let Ok(_transfer_fee_config) = token_mint_unpacked.get_extension::<TransferFeeConfig>() {
        is_harvestable = true;
    }
    // need to do this because Rust says we are still borrowing the data
    drop(token_mint_data);

    if is_harvestable {
        harvest_withheld_tokens_to_mint(
            CpiContext::new(
                token_program_id.to_account_info(),
                HarvestWithheldTokensToMint {
                    token_program_id: token_program_id.to_account_info(),
                    mint: mint.to_account_info(),
                },
            ),
            vec![token_account.to_account_info()],
        )?;
    }

    Ok(())
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

    if let Ok(memo_transfer) = extension {
        Ok(memo_transfer.require_incoming_transfer_memos.into())
    } else {
        Ok(false)
    }
}

fn get_transfer_hook_program_id<'info>(
    token_mint: &InterfaceAccount<'info, Mint>,
) -> Result<Option<Pubkey>> {
    let token_mint_info = token_mint.to_account_info();
    if *token_mint_info.owner == Token::id() {
        return Ok(None);
    }

    let token_mint_data = token_mint_info.try_borrow_data()?;
    let token_mint_unpacked =
        StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&token_mint_data)?;
    Ok(extension::transfer_hook::get_program_id(
        &token_mint_unpacked,
    ))
}
