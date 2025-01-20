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

macro_rules! escrow_seeds_v3 {
    ($escrow:expr) => {
        &[
            b"escrow_v3".as_ref(),
            $escrow.base.as_ref(),
            &[$escrow.escrow_bump],
        ]
    };
}
