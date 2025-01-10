use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use vesting_escrow_v3::VestingEscrowV3;

use crate::util::{
    calculate_transfer_fee_included_amount, parse_remaining_accounts, transfer_to_escrow_v2,
    validate_mint, AccountsType, ParsedRemainingAccounts,
};
use crate::TokenProgramFlag::{UseSplToken, UseToken2022};
use crate::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
/// Accounts for [locker::create_vesting_escrow_v3].
pub struct CreateVestingEscrowV3Parameters {
    pub total_deposit_amount: u64,
    pub cancel_mode: u8,
    pub root: [u8; 32],
}

impl CreateVestingEscrowV3Parameters {
    pub fn init_escrow(
        &self,
        vesting_escrow: &AccountLoader<VestingEscrowV3>,
        token_mint: Pubkey,
        sender: Pubkey,
        base: Pubkey,
        total_deposit_amount: u64,
        escrow_bump: u8,
        token_program_flag: TokenProgramFlag,
    ) -> Result<()> {
        require!(
            CancelMode::try_from(self.cancel_mode).is_ok(),
            LockerError::InvalidCancelMode,
        );

        let mut vesting_escrow = vesting_escrow.load_init()?;
        vesting_escrow.init(
            token_mint,
            sender,
            base,
            total_deposit_amount,
            self.root,
            self.cancel_mode,
            escrow_bump,
            token_program_flag.into(),
        );

        Ok(())
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingEscrowV3<'info> {
    #[account(mut)]
    pub base: Signer<'info>,

    /// Escrow.
    #[account(
        init,
        seeds = [
            b"escrow_v3".as_ref(),
            base.key().as_ref(),
        ],
        bump,
        payer = sender,
        space = 8 + VestingEscrowV3::INIT_SPACE
    )]
    pub escrow: AccountLoader<'info, VestingEscrowV3>,

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Escrow Token Account.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Sender.
    #[account(mut)]
    pub sender: Signer<'info>,

    /// Sender Token Account.
    #[account(mut)]
    pub sender_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// system program.
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vesting_escrow_v3<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CreateVestingEscrowV3<'info>>,
    params: &CreateVestingEscrowV3Parameters,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    // Validate if token_mint is supported
    validate_mint(&ctx.accounts.token_mint)?;

    let token_mint_info = ctx.accounts.token_mint.to_account_info();
    let token_program_flag = match *token_mint_info.owner {
        spl_token::ID => Ok(UseSplToken),
        spl_token_2022::ID => Ok(UseToken2022),
        _ => Err(LockerError::IncorrectTokenProgramId),
    }?;

    params.init_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
        params.total_deposit_amount,
        ctx.bumps.escrow,
        token_program_flag,
    )?;

    // Process remaining accounts
    let mut remaining_accounts = &ctx.remaining_accounts[..];
    let parsed_transfer_hook_accounts = match remaining_accounts_info {
        Some(info) => parse_remaining_accounts(
            &mut remaining_accounts,
            &info.slices,
            &[AccountsType::TransferHookEscrow],
        )?,
        None => ParsedRemainingAccounts::default(),
    };

    transfer_to_escrow_v2(
        &ctx.accounts.sender,
        &ctx.accounts.token_mint,
        &ctx.accounts.sender_token,
        &ctx.accounts.escrow_token,
        &ctx.accounts.token_program,
        calculate_transfer_fee_included_amount(
            params.total_deposit_amount,
            &ctx.accounts.token_mint,
        )?,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    let &CreateVestingEscrowV3Parameters {
        root,
        total_deposit_amount,
        cancel_mode,
    } = params;

    emit_cpi!(EventCreateVestingEscrowV3 {
        total_deposit_amount,
        escrow: ctx.accounts.escrow.key(),
        cancel_mode,
        root: root
    });

    Ok(())
}
