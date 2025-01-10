use crate::*;

/// Accounts for [locker::create_vesting_escrow_metadata_v3].
#[derive(Accounts)]
#[instruction(metadata: CreateVestingEscrowMetadataParameters)]
pub struct CreateVestingEscrowMetadataV3<'info> {
    /// The [Escrow].
    #[account(mut, has_one = creator)]
    pub escrow: AccountLoader<'info, VestingEscrowV3>,
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

pub fn handle_create_vesting_escrow_metadata_v3(
    ctx: Context<CreateVestingEscrowMetadataV3>,
    params: &CreateVestingEscrowMetadataParameters,
) -> Result<()> {
    let escrow_metadata = &mut ctx.accounts.escrow_metadata;
    escrow_metadata.escrow = ctx.accounts.escrow.key();
    escrow_metadata.name = params.name.clone();
    escrow_metadata.description = params.description.clone();
    escrow_metadata.creator_email = params.creator_email.clone();
    escrow_metadata.recipient_email = params.recipient_email.clone();
    Ok(())
}
