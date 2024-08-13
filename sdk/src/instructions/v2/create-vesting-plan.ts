import { Instruction } from "@orca-so/common-sdk";
import {BN, Program} from "@coral-xyz/anchor";
import { JupLock } from ".././../artifacts/locker";
import {Keypair, PublicKey} from "@solana/web3.js";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {PDAUtil} from "../../utils/public/pda-utils";

export type CreateVestingEscrowParamsV2 = {
    startTime: BN,
    frequency: BN,
    initialUnlockAmount: BN,
    amountPerPeriod: BN,
    numberOfPeriod: BN,
    updateRecipientMode: number,
    memo: string,
    sender: PublicKey,
    base: PublicKey,
    tokenMint: PublicKey,
    recipient: PublicKey,
    escrow: PublicKey,
    tokenProgram: PublicKey,

}

export async function createVestingEscrowV2Ix(
    program: Program<JupLock>,
    params: CreateVestingEscrowParamsV2,
): Promise<Instruction> {
    const { startTime, frequency, initialUnlockAmount, amountPerPeriod, numberOfPeriod, updateRecipientMode, memo} = params;
    const ix = await program.methods.createVestingEscrowV2({
        startTime,
        frequency,
        initialUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        updateRecipientMode,
    }, memo).accounts(createVestingEscrowV2Accounts(program.programId, params)).instruction()
    
    return {
        instructions: [ix],
        cleanupInstructions: [],
        signers: [],
    };
}

function createVestingEscrowV2Accounts(programId: PublicKey, params: CreateVestingEscrowParamsV2) {
    const {
        base,
        sender,
        tokenMint ,
        recipient,
        tokenProgram,
    } = params;

    let [escrow] = PDAUtil.getEscrow(base, programId);

    const senderToken = getAssociatedTokenAddressSync(
        tokenMint,
        sender,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const escrowToken = getAssociatedTokenAddressSync(
        tokenMint,
        escrow,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return {
        base,
        tokenMint,
        recipient,
        escrow,
        escrowToken,
        sender,
        senderToken,
        tokenProgram,
    }
}