import {JupLockClient} from "../jup-lock-client";
import {Keypair, PublicKey} from "@solana/web3.js";
import {JupLockContext} from "../context";
import {createVestingEscrowV2Ix, CreateVestingEscrowParamsV2} from "../instructions";
import {TransactionBuilder} from "@orca-so/common-sdk";
import {BN} from "@coral-xyz/anchor";

export class JupLockClientImpl implements JupLockClient {
    constructor(readonly ctx: JupLockContext) {}

    public getContext(): JupLockContext {
        return this.ctx;
    }


    // V2 instructions
    public async createVestingEscrowV2(
        params: CreateVestingEscrowParamsV2
    ) : Promise<{vestingEscrow: PublicKey}> {
        const txBuilder = new TransactionBuilder(
            this.ctx.provider.connection,
            this.ctx.provider.wallet,
        );

        const vestingEscrowIx = await createVestingEscrowV2Ix(
            this.ctx.program,
            params
        )

        txBuilder.addInstruction(vestingEscrowIx);

        return {vestingEscrow: new Keypair().publicKey, tx: txBuilder}
    }
}