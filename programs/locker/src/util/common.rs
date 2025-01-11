// borrow code from anchor lang

use anchor_lang::prelude::{Id, System};
use anchor_lang::Result;
use solana_program::account_info::AccountInfo;
use solana_program::system_program;

pub fn close<'info>(info: AccountInfo<'info>, sol_destination: AccountInfo<'info>) -> Result<()> {
    // Transfer tokens from the account to the sol_destination.
    let dest_starting_lamports = sol_destination.lamports();
    **sol_destination.lamports.borrow_mut() =
        dest_starting_lamports.checked_add(info.lamports()).unwrap();
    **info.lamports.borrow_mut() = 0;

    info.assign(&system_program::ID);
    info.realloc(0, false).map_err(Into::into)
}

pub fn is_closed(info: &AccountInfo) -> bool {
    info.owner == &System::id() && info.data_is_empty()
}

/// This is safe because it shortens lifetimes 'info: 'o and 'a: 'o to that of 'o
pub fn account_info_ref_lifetime_shortener<'info: 'a + 'o, 'a: 'o, 'o>(
    account_info: &'a AccountInfo<'info>,
) -> &'o AccountInfo<'o> {
    unsafe { core::mem::transmute(account_info) }
}
