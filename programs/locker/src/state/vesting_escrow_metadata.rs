use crate::*;

/// Metadata about an escrow.
#[account]
#[derive(Debug, Default)]
pub struct VestingEscrowMetadata {
    /// The [Escrow].
    pub escrow: Pubkey,
    /// Name of escrow.
    pub name: String,
    /// Description of escrow.
    pub description: String,
    /// Email of creator
    pub creator_email: String,
    /// Email of recipient
    pub recipient_email: String,
}

impl VestingEscrowMetadata {
    /// Space that a [EscrowMetadata] takes up.
    pub fn space(metadata: &CreateVestingEscrowMetadataParameters) -> usize {
        std::mem::size_of::<Pubkey>()
            + 4
            + metadata.name.as_bytes().len()
            + 4
            + metadata.description.as_bytes().len()
            + 4
            + metadata.creator_email.as_bytes().len()
            + 4
            + metadata.recipient_email.as_bytes().len()
    }
}
