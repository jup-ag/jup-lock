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

// macro_rules! escrow_metadata_seeds {
//     ($escrow:expr, $bump:expr) => {
//         &[b"escrow_metadata".as_ref(), $escrow.as_ref(), &[$bump]]
//     };
// }
