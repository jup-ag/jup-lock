use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::util::{
    calculate_transfer_fee_included_amount, parse_remaining_accounts, transfer_to_escrow_v2,
    validate_mint, AccountsType, ParsedRemainingAccounts,
};
use crate::TokenProgramFlag::{UseSplToken, UseToken2022};
use crate::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateVestingEscrowParametersV3 {
    pub create_vesting_params: CreateVestingEscrowParameters,
    pub root: [u8; 32],
}

impl CreateVestingEscrowParametersV3 {
    pub fn batch_init_escrow(
        &self,
        vesting_escrow: &AccountLoader<VestingEscrow>,
        token_mint: Pubkey,
        sender: Pubkey,
        base: Pubkey,
        escrow_bump: u8,
        token_program_flag: TokenProgramFlag,
    ) -> Result<()> {
        self.create_vesting_params.validate()?;

        let CreateVestingEscrowParameters {
            vesting_start_time,
            cliff_time,
            frequency,
            cliff_unlock_amount,
            amount_per_period,
            number_of_period,
            update_recipient_mode,
            cancel_mode,
        } = self.create_vesting_params;

        let mut escrow = vesting_escrow.load_init()?;

        escrow.batch_init(
            vesting_start_time,
            cliff_time,
            frequency,
            cliff_unlock_amount,
            amount_per_period,
            number_of_period,
            self.root,
            token_mint,
            sender,
            base,
            escrow_bump,
            update_recipient_mode,
            cancel_mode,
            token_program_flag.into(),
        );

        Ok(())
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingEscrowV3<'info> {
    /// Base.
    #[account(mut)]
    pub base: Signer<'info>,

    /// Escrow.
    #[account(
        init,
        seeds = [
            b"escrow".as_ref(),
            base.key().as_ref(),
        ],
        bump,
        payer = sender,
        space = 8 + VestingEscrow::INIT_SPACE
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    // Mint.
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
    params: CreateVestingEscrowParametersV3,
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

    params.batch_init_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.sender_token.mint,
        ctx.accounts.sender.key(),
        ctx.accounts.base.key(),
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
            params.create_vesting_params.get_total_deposit_amount()?,
            &ctx.accounts.token_mint,
        )?,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    let CreateVestingEscrowParametersV3 {
        create_vesting_params,
        root,
    } = params;

    let CreateVestingEscrowParameters {
        vesting_start_time,
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        update_recipient_mode,
        cancel_mode,
    } = create_vesting_params;

    emit_cpi!(EventCreateVestingEscrowV3 {
        vesting_start_time,
        cliff_time,
        frequency,
        cliff_unlock_amount,
        amount_per_period,
        number_of_period,
        root: root,
        escrow: ctx.accounts.escrow.key(),
        update_recipient_mode,
        cancel_mode,
    });
    Ok(())
}
