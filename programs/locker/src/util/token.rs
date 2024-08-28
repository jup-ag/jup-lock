use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

use crate::VestingEscrow;

pub fn transfer_to_escrow<'info>(
    sender: &Signer<'info>,
    sender_token: &Account<'info, TokenAccount>,
    escrow_token: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    anchor_spl::token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: sender_token.to_account_info(),
                to: escrow_token.to_account_info(),
                authority: sender.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}

pub fn transfer_to_recipient<'info>(
    escrow: &AccountLoader<'info, VestingEscrow>,
    escrow_token: &Account<'info, TokenAccount>,
    recipient_token: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let escrow_state = escrow.load()?;
    let escrow_seeds = escrow_seeds!(escrow_state);

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: escrow_token.to_account_info(),
                to: recipient_token.to_account_info(),
                authority: escrow.to_account_info(),
            },
            &[&escrow_seeds[..]],
        ),
        amount,
    )?;
    Ok(())
}