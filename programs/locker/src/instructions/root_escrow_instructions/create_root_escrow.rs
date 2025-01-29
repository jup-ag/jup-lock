use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_interface::Mint;
use util::validate_mint;

use crate::TokenProgramFlag::{UseSplToken, UseToken2022};
use crate::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateRootEscrowParameters {
    pub max_claim_amount: u64,
    pub max_escrow: u64,
    pub version: u64,
    pub root: [u8; 32],
}

impl CreateRootEscrowParameters {
    fn validate(&self) -> Result<()> {
        require!(
            self.max_claim_amount > 0 && self.max_escrow > 0,
            LockerError::InvalidParams
        );
        Ok(())
    }
}

/// Accounts for [locker::create_root_escrow].
#[event_cpi]
#[derive(Accounts)]
#[instruction(params: CreateRootEscrowParameters)]
pub struct CreateRootEscrowCtx<'info> {
    pub base: Signer<'info>,

    /// Root Escrow.
    #[account(
        init,
        seeds = [
            b"root_escrow".as_ref(),
            base.key().as_ref(),
            token_mint.key().as_ref(),
            params.version.to_le_bytes().as_ref(),
        ],
        bump,
        payer = payer,
        space = 8 + RootEscrow::INIT_SPACE
    )]
    pub root_escrow: AccountLoader<'info, RootEscrow>,

    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Creator.
    pub creator: UncheckedAccount<'info>,

    /// system program.
    pub system_program: Program<'info, System>,
}

pub fn handle_create_root_escrow<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CreateRootEscrowCtx<'info>>,
    params: &CreateRootEscrowParameters,
) -> Result<()> {
    params.validate()?;
    // Validate if token_mint is supported
    // dont allow transfer fee
    validate_mint(&ctx.accounts.token_mint, false)?;

    let token_mint_info = ctx.accounts.token_mint.to_account_info();
    let token_program_flag = match *token_mint_info.owner {
        spl_token::ID => Ok(UseSplToken),
        spl_token_2022::ID => Ok(UseToken2022),
        _ => Err(LockerError::IncorrectTokenProgramId),
    }?;

    let mut root_escrow = ctx.accounts.root_escrow.load_init()?;
    root_escrow.init(
        ctx.accounts.token_mint.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.base.key(),
        params.max_claim_amount,
        params.max_escrow,
        params.root,
        ctx.bumps.root_escrow,
        params.version,
        token_program_flag.into(),
    );

    emit_cpi!(EventCreateRootEscrow {
        root_escrow: ctx.accounts.root_escrow.key(),
        max_claim_amount: params.max_claim_amount,
        max_escrow: params.max_escrow,
        version: params.version,
        root: params.root
    });

    Ok(())
}
