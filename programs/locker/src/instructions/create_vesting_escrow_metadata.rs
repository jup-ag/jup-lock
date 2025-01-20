use util::account_info_ref_lifetime_shortener;

use crate::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateVestingEscrowMetadataParameters {
    pub name: String,
    pub description: String,
    pub creator_email: String,
    pub recipient_endpoint: String,
}

/// Accounts for [locker::create_vesting_escrow_metadata].
#[derive(Accounts)]
#[instruction(metadata: CreateVestingEscrowMetadataParameters)]
pub struct CreateVestingEscrowMetadataCtx<'info> {
    /// CHECK: The [Escrow] read-only, used to validate the escrow's creator
    pub escrow: AccountInfo<'info>,
    /// Creator of the escrow.
    pub creator: Signer<'info>,
    /// The [ProposalMeta].
    #[account(
        init,
        seeds = [
            b"escrow_metadata".as_ref(),
            escrow.key().as_ref()
        ],
        bump,
        payer = payer,
        space = 8 + VestingEscrowMetadata::space(&metadata)
    )]
    pub escrow_metadata: Box<Account<'info, VestingEscrowMetadata>>,
    /// Payer of the [ProposalMeta].
    #[account(mut)]
    pub payer: Signer<'info>,
    /// system program.
    pub system_program: Program<'info, System>,
}

impl CreateVestingEscrowMetadataCtx<'_> {
    pub fn validate_escrow_creator(&self) -> Result<()> {

        // First try VestingEscrow
        if let Ok(escrow) = AccountLoader::<VestingEscrow>::try_from(
            account_info_ref_lifetime_shortener(&self.escrow.to_account_info()),
        ) {
            require_keys_eq!(
                escrow.load()?.creator,
                self.creator.key(),
                LockerError::NotPermitToDoThisAction
            );

            return Ok(());
        }

        // Otherwise, attempt to load VestingEscrowV3
        if let Ok(escrow) = AccountLoader::<VestingEscrowV3>::try_from(
            account_info_ref_lifetime_shortener(&self.escrow.to_account_info()),
        ) {
            require_keys_eq!(
                escrow.load()?.creator,
                self.creator.key(),
                LockerError::NotPermitToDoThisAction
            );

            return Ok(());
        }

        err!(LockerError::NotPermitToDoThisAction)
    }
}

pub fn handle_create_vesting_escrow_metadata(
    ctx: Context<CreateVestingEscrowMetadataCtx>,
    params: &CreateVestingEscrowMetadataParameters,
) -> Result<()> {
    ctx.accounts.validate_escrow_creator()?;

    let escrow_metadata = &mut ctx.accounts.escrow_metadata;
    escrow_metadata.escrow = ctx.accounts.escrow.key();
    escrow_metadata.name = params.name.clone();
    escrow_metadata.description = params.description.clone();
    escrow_metadata.creator_email = params.creator_email.clone();
    escrow_metadata.recipient_endpoint = params.recipient_endpoint.clone();
    Ok(())
}
