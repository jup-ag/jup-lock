use crate::UncloseableFlag::Closeable;
use crate::*;
use anchor_spl::{
    memo::Memo,
    token_interface::{close_account, CloseAccount, Mint, TokenAccount, TokenInterface},
};
use util::{
    close, harvest_fees, is_closed, parse_remaining_accounts, transfer_to_user2, AccountsType,
    MemoTransferContext, ParsedRemainingAccounts, TRANSFER_MEMO_CLOSE_ESCROW,
};

/// Accounts for [locker::close_vesting_escrow].
#[derive(Accounts)]
#[event_cpi]
pub struct CloseVestingEscrowCtx<'info> {
    /// Escrow.
    #[account(
        mut,
        has_one = creator,
        close = creator,
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    /// CHECK: escrow metadata
    #[account(
        mut,
        seeds = [
            b"escrow_metadata".as_ref(),
            escrow.key().as_ref()
        ],
        bump,
    )]
    pub escrow_metadata: AccountInfo<'info>,

    /// Mint.
    #[account(mut)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Escrow Token Account.
    #[account(mut)]
    pub escrow_token: AccountInfo<'info>,

    #[account(mut)]
    pub creator_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// Memo program.
    pub memo_program: Program<'info, Memo>,
}

pub fn handle_close_vesting_escrow<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CloseVestingEscrowCtx<'info>>,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    let escrow = ctx.accounts.escrow.load()?;
    // if escrow is not cancelled, we need to close escrow token account
    if escrow.cancelled_at == 0 {
        require!(
            escrow.is_claimed_full_amount()?,
            LockerError::ClaimingIsNotFinished
        );
        let escrow_token =
            anchor_spl::associated_token::get_associated_token_address_with_program_id(
                &ctx.accounts.escrow.key(),
                &escrow.token_mint,
                &ctx.accounts.token_program.key(),
            );
        require!(
            escrow_token == ctx.accounts.escrow_token.key(),
            LockerError::InvalidEscrowTokenAddress
        );

        let amount = anchor_spl::token::accessor::amount(&ctx.accounts.escrow_token)?;
        if amount > 0 {
            // Transfer the remaining amount to the creator, in case someone wrongly send token to escrow_token
            let mut remaining_accounts = &ctx.remaining_accounts[..];
            let parsed_transfer_hook_accounts = match remaining_accounts_info {
                Some(info) => parse_remaining_accounts(
                    &mut remaining_accounts,
                    &info.slices,
                    &[AccountsType::TransferHookEscrow],
                )?,
                None => ParsedRemainingAccounts::default(),
            };
            transfer_to_user2(
                &ctx.accounts.escrow,
                &ctx.accounts.token_mint,
                &ctx.accounts.escrow_token,
                &ctx.accounts.creator_token,
                &ctx.accounts.token_program,
                Some(MemoTransferContext {
                    memo_program: &ctx.accounts.memo_program,
                    memo: TRANSFER_MEMO_CLOSE_ESCROW.as_bytes(),
                }),
                amount,
                parsed_transfer_hook_accounts.transfer_hook_escrow,
            )?;
        }

        // Do fee harvesting
        harvest_fees(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow_token,
            &ctx.accounts.token_mint,
        )?;

        // close escrow token
        let escrow_seeds = escrow_seeds!(escrow);
        // Allow closing of token account but not the escrow.
        if escrow.uncloseable_flag == Closeable as u8 {
            close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.escrow_token.to_account_info(),
                    destination: ctx.accounts.creator.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                &[&escrow_seeds[..]],
            ))?;
        }
    }

    // close escrow metadata
    if !is_closed(&ctx.accounts.escrow_metadata) {
        close(
            ctx.accounts.escrow_metadata.clone(),
            ctx.accounts.creator.to_account_info(),
        )?;
    }

    emit_cpi!(EventCloseVestingEscrow {
        escrow: ctx.accounts.escrow.key(),
    });
    Ok(())
}
