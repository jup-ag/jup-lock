use crate::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCtx<'info> {
    #[account(mut, has_one = recipient)]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(mut)]
    pub escrow_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(mut, constraint = recipient_token.key() != escrow_token.key() @ LockerError::InvalidRecipientTokenAccount)]
    pub recipient_token: Box<Account<'info, TokenAccount>>,

    /// Token program.
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimCtx<'info> {
    fn transfer_to_recipient(&self, amount: u64) -> Result<()> {
        let escrow = self.escrow.load()?;
        let escrow_seeds = escrow_seeds!(escrow);
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.escrow_token.to_account_info(),
                    to: self.recipient_token.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
                &[&escrow_seeds[..]],
            ),
            amount,
        )?;
        Ok(())
    }
}

pub fn handle_claim(ctx: Context<ClaimCtx>, max_amount: u64) -> Result<()> {
    let current_ts = Clock::get()?.unix_timestamp as u64;
    let mut escrow = ctx.accounts.escrow.load_mut()?;

    let escrow_token = anchor_spl::associated_token::get_associated_token_address(
        &ctx.accounts.escrow.key(),
        &escrow.token_mint,
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
