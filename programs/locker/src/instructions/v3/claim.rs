use crate::util::{transfer_to_user_v3, MemoTransferContext};
use crate::*;
use anchor_spl::memo::Memo;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use safe_math::SafeMath;
use solana_program::hash::hashv;
use util::{
    parse_remaining_accounts, AccountsType, ParsedRemainingAccounts, TRANSFER_MEMO_CLAIM_VESTING,
};

const LEAF_PREFIX: &[u8] = &[0];
const INTERMEDIATE_PREFIX: &[u8] = &[1];

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ClaimV3Params {
    pub vesting_start_time: u64,
    pub cliff_time: u64,
    pub frequency: u64,
    pub cliff_unlock_amount: u64,
    pub amount_per_period: u64,
    pub number_of_period: u64,
    pub max_amount: u64,
    pub proof: Vec<[u8; 32]>,
}

impl ClaimV3Params {
    pub fn verify_recipient(&self, recipient: Pubkey, root: [u8; 32]) -> Result<()> {
        let node = hashv(&[
            &recipient.key().to_bytes(),
            &self.cliff_unlock_amount.to_le_bytes(),
            &self.amount_per_period.to_le_bytes(),
            &self.number_of_period.to_le_bytes(),
            &self.cliff_time.to_le_bytes(),
            &self.frequency.to_le_bytes(),
            &self.vesting_start_time.to_le_bytes(),
        ]);

        let leaf = hashv(&[LEAF_PREFIX, &node.to_bytes()]);

        let mut computed_hash = leaf.to_bytes();
        for p in self.proof.iter() {
            if computed_hash <= *p {
                computed_hash = hashv(&[&INTERMEDIATE_PREFIX, &computed_hash, p]).to_bytes();
            } else {
                computed_hash = hashv(&[&INTERMEDIATE_PREFIX, p, &computed_hash]).to_bytes();
            }
        }

        require!(computed_hash == root, LockerError::InvalidMerkleProof);

        Ok(())
    }

    pub fn get_max_unlocked_amount(&self, current_ts: u64) -> Result<u64> {
        if current_ts < self.cliff_time {
            return Ok(0);
        }
        let period = current_ts
            .safe_sub(self.cliff_time)?
            .safe_div(self.frequency)?;
        let period = period.min(self.number_of_period);

        let unlocked_amount = self
            .cliff_unlock_amount
            .safe_add(period.safe_mul(self.amount_per_period)?)?;

        Ok(unlocked_amount)
    }

    pub fn get_claimable_amount(&self, total_claimed_amount: u64, current_ts: u64) -> Result<u64> {
        let max_unlocked_amount = self.get_max_unlocked_amount(current_ts)?;
        let claimable_amount = max_unlocked_amount.safe_sub(total_claimed_amount)?;
        Ok(claimable_amount)
    }

    pub fn get_claim_amount(&self, total_claimed_amount: u64) -> Result<u64> {
        let current_ts = Clock::get()?.unix_timestamp as u64;
        let claimable_amount = self.get_claimable_amount(total_claimed_amount, current_ts)?;

        let amount = claimable_amount.min(self.max_amount);

        Ok(amount)
    }
}

/// Accounts for [locker::claim_v3].
#[event_cpi]
#[derive(Accounts)]
pub struct ClaimV3<'info> {
    /// Claim status PDA
    #[account(
        init_if_needed,
        seeds = [
            b"claim_status".as_ref(),
            recipient.key().to_bytes().as_ref(),
            escrow.key().to_bytes().as_ref()
        ],
        bump,
        space = 8 + ClaimStatus::INIT_SPACE,
        payer = payer
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// Escrow.
    #[account(
        mut,
        has_one = token_mint,
        constraint = escrow.load()?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrowV3>,

    /// Mint.
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Escrow Token Account.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub escrow_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Recipient.
    pub recipient: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// Recipient Token Account.
    #[account(
        mut,
        constraint = recipient_token.key() != escrow_token.key() @ LockerError::InvalidRecipientTokenAccount
    )]
    pub recipient_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Memo program.
    pub memo_program: Program<'info, Memo>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,
    /// system program.
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_v3<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ClaimV3<'info>>,
    params: &ClaimV3Params,
    remaining_accounts_info: Option<RemainingAccountsInfo>,
) -> Result<()> {
    let claim_status = &mut ctx.accounts.claim_status;
    claim_status.init_if_needed(ctx.accounts.recipient.key(), ctx.accounts.escrow.key())?;

    let mut escrow = ctx.accounts.escrow.load_mut()?;

    params.verify_recipient(ctx.accounts.recipient.key(), escrow.root)?;

    let amount = params.get_claim_amount(claim_status.total_claimed_amount)?;
    escrow.accumulate_claimed_amount(amount)?;
    drop(escrow);

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

    transfer_to_user_v3(
        &ctx.accounts.escrow,
        &ctx.accounts.token_mint,
        &ctx.accounts.escrow_token.to_account_info(),
        &ctx.accounts.recipient_token,
        &ctx.accounts.token_program,
        Some(MemoTransferContext {
            memo_program: &ctx.accounts.memo_program,
            memo: TRANSFER_MEMO_CLAIM_VESTING.as_bytes(),
        }),
        amount,
        parsed_transfer_hook_accounts.transfer_hook_escrow,
    )?;

    // update claim status
    claim_status.accumulate_claimed_amount(amount)?;

    let current_ts = Clock::get()?.unix_timestamp as u64;

    emit_cpi!(EventClaimV3 {
        amount,
        current_ts,
        recipient: ctx.accounts.recipient.key(),
        escrow: ctx.accounts.escrow.key(),
        vesting_start_time: params.vesting_start_time,
        cliff_time: params.cliff_time,
        frequency: params.frequency,
        cliff_unlock_amount: params.cliff_unlock_amount,
        amount_per_period: params.amount_per_period,
        number_of_period: params.number_of_period,
    });
    Ok(())
}
