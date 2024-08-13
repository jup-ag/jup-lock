import {Connection} from "@solana/web3.js";
import {AnchorProvider, Program} from "@coral-xyz/anchor";
import {JupLock} from "./artifacts/locker";
import {Wallet} from "@orca-so/common-sdk";

/**
 * Context for storing environment classes and objects for usage throughout the SDK
 * @category Core
 */
export class JupLockContext {
    readonly connection: Connection;
    readonly wallet: Wallet;
    readonly program: Program<JupLock>;
    readonly provider: AnchorProvider;

    public static fromWorkspace(
        provider: AnchorProvider,
        program: Program,
    ) {
        return new JupLockContext(
            provider,
            provider.wallet,
            program,
        );
    }

    public constructor(
        provider: AnchorProvider,
        wallet: Wallet,
        program: Program,
    ) {
        this.connection = provider.connection;
        this.wallet = wallet;
        this.program = program as unknown as Program<JupLock>;
        this.provider = provider;
    }
}