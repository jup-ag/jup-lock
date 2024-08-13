import {JupLockContext} from "./context";
import {PublicKey} from "@solana/web3.js";
import {CreateVestingEscrowParamsV2} from "./instructions";
import {TransactionBuilder} from "@orca-so/common-sdk";

export interface JupLockClient {
    /**
     * Get this client's WhirlpoolContext object
     * @return a WhirlpoolContext object
     */
    getContext: () => JupLockContext;

    createVestingEscrowV2: (params: CreateVestingEscrowParamsV2) => Promise<{vestingEscrow: PublicKey, tx: TransactionBuilder}>
}