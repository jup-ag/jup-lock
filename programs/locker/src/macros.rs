//! Macro functions

macro_rules! escrow_seeds {
    ($escrow:expr) => {
        &[
            b"escrow".as_ref(),
            $escrow.base.as_ref(),
            &[$escrow.escrow_bump],
        ]
    };
}
 
macro_rules! root_escrow_seeds {
    ($root_escrow:expr) => {
        &[
            b"root_escrow".as_ref(),
            $root_escrow.base.as_ref(),
            $root_escrow.token_mint.as_ref(),
            &$root_escrow.version.to_le_bytes(),
            &[$root_escrow.bump],
        ]
    };
}
