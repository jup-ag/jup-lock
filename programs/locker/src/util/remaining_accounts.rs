use anchor_lang::prelude::*;

use crate::LockerError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AccountsType {
    TransferHookInput,
    TransferHookClaim,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RemainingAccountsSlice {
    pub accounts_type: AccountsType,
    pub length: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RemainingAccountsInfo {
    pub slices: Vec<RemainingAccountsSlice>,
}

#[derive(Default)]
pub struct ParsedRemainingAccounts<'a, 'info> {
    pub transfer_hook_input: Option<&'a [AccountInfo<'info>]>,
    pub transfer_hook_claim: Option<&'a [AccountInfo<'info>]>,
}

pub fn parse_remaining_accounts<'a, 'info>(
    remaining_accounts: &mut &'a [AccountInfo<'info>],
    remaining_accounts_slice: &[RemainingAccountsSlice],
    valid_accounts_type_list: &[AccountsType],
) -> Result<ParsedRemainingAccounts<'a, 'info>> {
    let mut parsed_remaining_accounts = ParsedRemainingAccounts::default();

    if remaining_accounts_slice.is_empty() {
        return Ok(ParsedRemainingAccounts::default());
    }

    for slice in remaining_accounts_slice.iter() {
        if !valid_accounts_type_list.contains(&slice.accounts_type) {
            return Err(LockerError::InvalidRemainingAccountSlice.into());
        }

        if slice.length == 0 {
            continue;
        }

        if remaining_accounts.len() < slice.length as usize {
            return Err(LockerError::InsufficientRemainingAccounts.into());
        }

        let end_idx = slice.length as usize;
        let accounts = &remaining_accounts[0..end_idx];
        *remaining_accounts = &remaining_accounts[end_idx..];

        match slice.accounts_type {
            AccountsType::TransferHookInput => {
                if parsed_remaining_accounts.transfer_hook_input.is_some() {
                    return Err(LockerError::DuplicatedRemainingAccountTypes.into());
                }
                parsed_remaining_accounts.transfer_hook_input = Some(accounts);
            }
            AccountsType::TransferHookClaim => {
                if parsed_remaining_accounts.transfer_hook_claim.is_some() {
                    return Err(LockerError::DuplicatedRemainingAccountTypes.into());
                }
                parsed_remaining_accounts.transfer_hook_claim = Some(accounts);
            }
        }
    }

    Ok(parsed_remaining_accounts)
}
