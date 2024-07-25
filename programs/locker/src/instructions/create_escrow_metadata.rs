use crate::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateEscrowMetadataParameters {
    pub name: String,
    pub description: String,
    pub creator_email: String,
    pub recipient_email: String,
}

/// Accounts for [locker::create_escrow_metadata].
#[derive(Accounts)]
#[instruction(metadata: CreateEscrowMetadataParameters)]
pub struct CreateEscrowMetadataCtx<'info> {
    /// The [Escrow].
    #[account(mut, has_one = creator)]
    pub escrow: AccountLoader<'info, Escrow>,
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
        space = 8 + EscrowMetadata::space(&metadata)
    )]
    pub escrow_metadata: Box<Account<'info, EscrowMetadata>>,
    /// Payer of the [ProposalMeta].
    #[account(mut)]
    pub payer: Signer<'info>,
    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn handle_create_escrow_metadata(
    ctx: Context<CreateEscrowMetadataCtx>,
    params: &CreateEscrowMetadataParameters,
) -> Result<()> {
    let escrow_metadata = &mut ctx.accounts.escrow_metadata;
    escrow_metadata.escrow = ctx.accounts.escrow.key();
    escrow_metadata.name = params.name.clone();
    escrow_metadata.description = params.description.clone();
    escrow_metadata.creator_email = params.creator_email.clone();
    escrow_metadata.recipient_email = params.recipient_email.clone();
    Ok(())
}
