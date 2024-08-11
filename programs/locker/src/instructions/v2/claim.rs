use crate::util::{is_transfer_memo_required, token};
use crate::util::token::fee_amount;
use crate::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use std::cmp::min;
use anchor_spl::memo;
use anchor_spl::memo::{BuildMemo, Memo};
use crate::instructions::transfer_memo;

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimV2<'info> {
    #[account(mut, has_one = recipient)]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub memo_program: Program<'info, Memo>,

    #[account(mut)]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(mut, constraint = recipient_token.key() != escrow_token.key() @ LockerError::InvalidRecipientTokenAccount)]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> ClaimV2<'info> {
    fn transfer_to_recipient(&self, amount: u64) -> Result<()> {
        let escrow = self.escrow.load()?;
        let escrow_seeds = escrow_seeds!(escrow);

        let token_mint_info = self.mint.to_account_info();
        let token_mint_data = token_mint_info.data.borrow();
        let token_mint_unpacked =
            token::unpack_mint_with_extensions(&token_mint_data, &self.token_program.key)?;

        if is_transfer_memo_required(&token_mint_unpacked) {
            memo::build_memo(
                CpiContext::new(
                    self.memo_program.to_account_info(),
                    BuildMemo {}
                ),
                transfer_memo::TRANSFER_MEMO_CLAIM_VESTING.as_bytes()
            )?;
        }

        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.escrow_token.to_account_info(),
                    to: self.recipient_token.to_account_info(),
                    authority: self.escrow.to_account_info(),
                    mint: self.mint.to_account_info(),
                },
                &[&escrow_seeds[..]],
            ),
            // amount.saturating_add(fee_amount(amount, token_mint_unpacked)?),
            min(
                amount.saturating_add(fee_amount(amount, &token_mint_unpacked)?),
                self.escrow_token.amount,
            ),
            self.mint.decimals,
        )?;
        Ok(())
    }
}

pub fn handle_claim_v2(ctx: Context<ClaimV2>, max_amount: u64) -> Result<()> {
    let current_ts = Clock::get()?.unix_timestamp as u64;
    let mut escrow = ctx.accounts.escrow.load_mut()?;

    let escrow_token = anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &ctx.accounts.escrow.key(),
        &escrow.token_mint,
        &ctx.accounts.token_program.key,
    );

    require!(
        escrow_token == ctx.accounts.escrow_token.key(),
        LockerError::InvalidEscrowTokenAddress
    );

    let claimable_amount = escrow.get_claimable_amount(current_ts)?;

    let amount = claimable_amount.min(max_amount);
    escrow.accumulate_claimed_amount(amount)?;

    // localnet debug
    #[cfg(feature = "localnet")]
    msg!(
        "claim amount {} {} {}",
        amount,
        current_ts,
        escrow.start_time
    );

    drop(escrow);

    ctx.accounts.transfer_to_recipient(amount)?;

    emit_cpi!(EventClaim {
        amount,
        current_ts,
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
