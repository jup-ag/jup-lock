import {PublicKey} from "@solana/web3.js";
import {web3} from "@coral-xyz/anchor";


const PDA_ESCROW_SEED = "escrow";

/**
 * @category JupLock Utils
 */
export class PDAUtil {
    public static getEscrow(
        programId: PublicKey,
        base: PublicKey,
    ) {
        return web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from(PDA_ESCROW_SEED),
                base.toBuffer()
            ],
            programId
        );

    }
}

