use crate::*;

#[derive(Accounts)]
pub struct UpdateVestingEscrowRecipientCtx<'info> {
    #[account(mut)]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    #[account(mut)]
    pub signer: Signer<'info>,
}

pub fn handle_update_vesting_escrow_recipient(
    ctx: Context<UpdateVestingEscrowRecipientCtx>,
    new_recipient: Pubkey,
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let old_recipient = escrow.recipient;
    let signer = ctx.accounts.signer.key();
    let update_recipient_mode =
        UpdateRecipientMode::try_from(escrow.update_recipient_mode).unwrap();

    match update_recipient_mode {
        UpdateRecipientMode::NeitherCreatorOrRecipient => {
            return Err(LockerError::NotPermitToDoThisAction.into());
        }
        UpdateRecipientMode::OnlyCreator => {
            require!(
                signer == escrow.creator,
                LockerError::NotPermitToDoThisAction
            );
        }
        UpdateRecipientMode::OnlyRecipient => {
            require!(
                signer == escrow.recipient,
                LockerError::NotPermitToDoThisAction
            );
        }
        UpdateRecipientMode::EitherCreatorAndRecipient => {
            require!(
                signer == escrow.creator || signer == escrow.recipient,
                LockerError::NotPermitToDoThisAction
            );
        }
    }

    escrow.update_recipient(new_recipient);

    emit!(EventUpdateVestingEscrowRecipient {
        escrow: ctx.accounts.escrow.key(),
        signer,
        old_recipient,
        new_recipient,
    });
    Ok(())
}
