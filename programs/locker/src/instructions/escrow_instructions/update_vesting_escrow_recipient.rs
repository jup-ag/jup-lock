use crate::*;

/// Accounts for [locker::update_vesting_escrow_recipient].
#[derive(Accounts)]
#[event_cpi]
pub struct UpdateVestingEscrowRecipientCtx<'info> {
    /// Escrow.
    #[account(
        mut,
        constraint = escrow.load()?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    /// Escrow metadata.
    #[account(mut)]
    pub escrow_metadata: Option<Account<'info, VestingEscrowMetadata>>,

    /// Signer.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// system program.
    pub system_program: Program<'info, System>,
}

pub fn handle_update_vesting_escrow_recipient(
    ctx: Context<UpdateVestingEscrowRecipientCtx>,
    new_recipient: Pubkey,
    new_recipient_email: Option<String>,
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let old_recipient = escrow.recipient;
    let signer = ctx.accounts.signer.key();
    escrow.validate_update_actor(signer)?;
    escrow.update_recipient(new_recipient);

    if let Some(recipient_email) = new_recipient_email {
        if let Some(escrow_metadata) = &mut ctx.accounts.escrow_metadata {
            require!(
                escrow_metadata.escrow == ctx.accounts.escrow.key(),
                LockerError::InvalidEscrowMetadata
            );
            let escrow_metadata_info = escrow_metadata.to_account_info();
            let new_len =
                8 + VestingEscrowMetadata::space(&CreateVestingEscrowMetadataParameters {
                    name: escrow_metadata.name.clone(),
                    description: escrow_metadata.description.clone(),
                    creator_email: escrow_metadata.creator_email.clone(),
                    recipient_email: recipient_email.clone(),
                });

            // update rent fee
            let rent = Rent::get()?;
            let new_minimum_balance = rent.minimum_balance(new_len);
            let lamports_diff = new_minimum_balance.saturating_sub(escrow_metadata_info.lamports());

            let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: escrow_metadata_info.clone(),
                },
            );
            anchor_lang::system_program::transfer(cpi_context, lamports_diff)?;

            // realloc
            escrow_metadata_info.realloc(new_len, false)?;
            // update new recipient_email
            escrow_metadata.recipient_email = recipient_email;
        } else {
            return Err(LockerError::InvalidEscrowMetadata.into());
        }
    }
    emit_cpi!(EventUpdateVestingEscrowRecipient {
        escrow: ctx.accounts.escrow.key(),
        signer,
        old_recipient,
        new_recipient,
    });
    Ok(())
}
