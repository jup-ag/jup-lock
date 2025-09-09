use crate::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use merkle_verify::verify;
use util::{
    calculate_transfer_fee_included_amount, parse_remaining_accounts, transfer_from_root_escrow,
    AccountsType, ParsedRemainingAccounts,
};

const LEAF_PREFIX: &[u8] = &[0];

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateVestingEscrowFromRootParams {
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub update_recipient_mode: u8,
    pub cancel_mode: u8,
}

impl CreateVestingEscrowFromRootParams {
    pub fn into_vesting_escrow_params(&self) -> CreateVestingEscrowParameters {
        CreateVestingEscrowParameters {
            vesting_start_time: self.vesting_start_time,
            cliff_time: self.cliff_time,
            frequency: self.frequency,
            cliff_unlock_amount: self.cliff_unlock_amount,
            amount_per_period: self.amount_per_period,
            number_of_period: self.number_of_period,
            update_recipient_mode: self.update_recipient_mode,
            cancel_mode: self.cancel_mode,
        }
    }
}

/// Accounts for [locker::create_vesting_escrow_from_root].
#[event_cpi]
#[derive(Accounts)]
pub struct CreateVestingEscrowFromRootCtx<'info> {
    /// Root Escrow.
    #[account(
        mut,
        has_one = token_mint,
    )]
    pub root_escrow: AccountLoader<'info, RootEscrow>,

    /// Base account for deriving escrow PDA and enforcing uniqueness.
    #[account(
        init,
        seeds = [
            b"base",
            root_escrow.key().as_ref(),
            recipient.key().as_ref(),
        ],
        payer = payer,
        space = 8,
        bump,
    )]
    pub base: AccountLoader<'info, Marker>,

    /// Escrow.
    #[account(
        init,
        seeds = [
            b"escrow".as_ref(),
            base.key().as_ref(),
        ],
        bump,
        payer = payer,
        space = 8 + VestingEscrow::INIT_SPACE
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    /// Escrow Token Account.
    #[account(
        init_if_needed,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program,
        payer = payer,
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = root_escrow,
        associated_token::token_program = token_program,
    )]
    pub root_escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Mint.
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Rent Payer
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: recipient
    pub recipient: UncheckedAccount<'info>,

    /// system program.
    pub system_program: Program<'info, System>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    // Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_create_vesting_escrow_from_root<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CreateVestingEscrowFromRootCtx<'info>>,
    params: &CreateVestingEscrowFromRootParams,
    proof: Vec<[u8; 32]>,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    // creator of root escrow is creator of vesting escrow
    let (token_program_flag, creator) = {
        // verify merkle tree
        let root_escrow = ctx.accounts.root_escrow.load()?;

        let node = hashv(&[
            &ctx.accounts.recipient.key().to_bytes(),
            &params.vesting_start_time.to_le_bytes(),
            &params.cliff_time.to_le_bytes(),
            &params.frequency.to_le_bytes(),
            &params.cliff_unlock_amount.to_le_bytes(),
            &params.amount_per_period.to_le_bytes(),
            &params.number_of_period.to_le_bytes(),
            &params.update_recipient_mode.to_le_bytes(),
            &params.cancel_mode.to_le_bytes(),
        ]);

        let node = hashv(&[LEAF_PREFIX, &node.to_bytes()]);

        require!(
            verify(proof, root_escrow.root, node.to_bytes()),
            LockerError::InvalidMerkleProof
        );
        (root_escrow.token_program_flag, root_escrow.creator)
    };

    // create escrow
    let params = params.into_vesting_escrow_params();
    params.init_escrow(
        &ctx.accounts.escrow,
        ctx.accounts.recipient.key(),
        ctx.accounts.token_mint.key(),
        creator,
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

    let total_deposit = params.get_total_deposit_amount()?;

    transfer_from_root_escrow(
        &ctx.accounts.root_escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.root_escrow_token.to_account_info(),
        &ctx.accounts.escrow_token,
        &ctx.accounts.token_program,
        calculate_transfer_fee_included_amount(total_deposit, &ctx.accounts.token_mint)?,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    let mut root_escrow = ctx.accounts.root_escrow.load_mut()?;
    root_escrow.update_new_escrow(total_deposit)?;

    emit_cpi!(EventCreateVestingEscrow {
        cliff_time: params.cliff_time,
        frequency: params.frequency,
        cliff_unlock_amount: params.cliff_unlock_amount,
        amount_per_period: params.amount_per_period,
        number_of_period: params.number_of_period,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
        update_recipient_mode: params.update_recipient_mode,
        vesting_start_time: params.vesting_start_time,
        cancel_mode: params.cancel_mode,
    });

    Ok(())
}
