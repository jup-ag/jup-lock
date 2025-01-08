use crate::*;

#[derive(Accounts)]
#[event_cpi]
pub struct UpdateVestingEscrowRoot<'info> {
    /// Escrow.
    #[account(
        mut,
        constraint = escrow.load()?.creator == signer.key() @ LockerError::NotPermitToDoThisAction,
        constraint = escrow.load()?.cancelled_at == 0 @ LockerError::AlreadyCancelled
    )]
    pub escrow: AccountLoader<'info, VestingEscrow>,

    /// Signer.
    #[account(mut)]
    pub signer: Signer<'info>,
}

pub fn handle_update_vesting_escrow_root(
    ctx: Context<UpdateVestingEscrowRoot>,
    new_root: [u8; 32],
) -> Result<()> {
    let mut escrow = ctx.accounts.escrow.load_mut()?;
    let old_root = escrow.root;
    let signer = ctx.accounts.signer.key();

    escrow.validate_update_root_actor(signer)?;
    escrow.update_root(new_root)?;

    //
    emit_cpi!(EventUpdateVestingEscrowRoot {
        escrow: ctx.accounts.escrow.key(),
        signer,
        old_root,
        new_root,
    });
    Ok(())
}
