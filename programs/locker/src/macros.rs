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
