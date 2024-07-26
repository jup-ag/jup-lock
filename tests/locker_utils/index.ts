import { AnchorProvider, Program, Wallet, web3, BN } from "@coral-xyz/anchor";
import { Locker, IDL as LockerIDL } from "../../target/types/locker";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { expect } from "chai";

export const LOCKER_PROGRAM_ID = new web3.PublicKey(
    "2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg"
);


export function createLockerProgram(
    wallet: Wallet,
): Program<Locker> {
    const provider = new AnchorProvider(AnchorProvider.env().connection, wallet, {
        maxRetries: 3,
    });
    const program = new Program<Locker>(LockerIDL, LOCKER_PROGRAM_ID, provider);
    return program;
}

export function deriveEscrow(
    base: web3.PublicKey,
    programId: web3.PublicKey
) {
    return web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("escrow"),
            base.toBuffer(),
        ],
        programId
    );
}


export function deriveEscrowMetadata(
    escrow: web3.PublicKey,
    programId: web3.PublicKey
) {
    return web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("escrow_metadata"),
            escrow.toBuffer(),
        ],
        programId
    );
}


export interface CreateVestingPlanParams {
    ownerKeypair: web3.Keypair,
    tokenMint: web3.PublicKey,
    isAssertion: boolean,
    startTime: BN,
    frequency: BN,
    cliffAmount: BN,
    amountPerPeriod: BN,
    numberOfPeriod: BN,
    recipient: web3.PublicKey,
    updateRecipientMode: number,
}

export async function createVestingPlan(params: CreateVestingPlanParams) {
    let { isAssertion, tokenMint, ownerKeypair, startTime, frequency, cliffAmount, amountPerPeriod, numberOfPeriod, recipient, updateRecipientMode } = params;
    const program = createLockerProgram(new Wallet(ownerKeypair));

    const baseKP = web3.Keypair.generate();

    let [escrow] = deriveEscrow(baseKP.publicKey, program.programId);

    const senderToken = getAssociatedTokenAddressSync(
        tokenMint,
        ownerKeypair.publicKey,
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
    await program.methods.createVestingPlan({
        startTime,
        frequency,
        cliffAmount,
        amountPerPeriod,
        numberOfPeriod,
        updateRecipientMode,
    }).accounts({
        base: baseKP.publicKey,
        senderToken,
        escrowToken,
        recipient,
        sender: ownerKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        escrow,
    }).preInstructions(
        [
            createAssociatedTokenAccountInstruction(
                ownerKeypair.publicKey,
                escrowToken,
                escrow,
                tokenMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        ]
    ).signers([baseKP]).rpc();

    if (isAssertion) {
        const escrowState = await program.account.escrow.fetch(escrow);
        expect(escrowState.startTime.toString()).eq(startTime.toString());
        expect(escrowState.frequency.toString()).eq(frequency.toString());
        expect(escrowState.cliffAmount.toString()).eq(cliffAmount.toString());
        expect(escrowState.amountPerPeriod.toString()).eq(amountPerPeriod.toString());
        expect(escrowState.numberOfPeriod.toString()).eq(numberOfPeriod.toString());
        expect(escrowState.recipient.toString()).eq(recipient.toString());
        expect(escrowState.escrowToken.toString()).eq(escrowToken.toString());
        expect(escrowState.creator.toString()).eq(ownerKeypair.publicKey.toString());
        expect(escrowState.base.toString()).eq(baseKP.publicKey.toString());
        expect(escrowState.updateRecipientMode).eq(updateRecipientMode);
    }

    return escrow;
}


export interface ClaimTokenParams {
    isAssertion: boolean,
    escrow: web3.PublicKey,
    recipient: web3.Keypair,
    maxAmount: BN,
    recipientToken: web3.PublicKey,
}
export async function claimToken(params: ClaimTokenParams) {
    let { isAssertion, escrow, recipient, maxAmount, recipientToken } = params;
    const program = createLockerProgram(new Wallet(recipient));
    const escrowState = await program.account.escrow.fetch(escrow);

    await program.methods.claim(maxAmount).accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        escrow,
        escrowToken: escrowState.escrowToken,
        recipient: recipient.publicKey,
        recipientToken,
    }).rpc();
}


export interface CreateEscrowMetadataParams {
    isAssertion: boolean,
    creator: web3.Keypair,
    escrow: web3.PublicKey,
    name: string,
    description: string,
    creatorEmail: string,
    recipientEmail: string,
}
export async function createEscrowMetadata(params: CreateEscrowMetadataParams) {
    let { isAssertion, escrow, name, description, creatorEmail, recipientEmail, creator } = params;
    const program = createLockerProgram(new Wallet(creator));
    const [escrowMetadata] = deriveEscrowMetadata(escrow, program.programId);
    await program.methods.createEscrowMetadata({
        name,
        description,
        creatorEmail,
        recipientEmail,
    }).accounts({
        escrow,
        systemProgram: web3.SystemProgram.programId,
        payer: creator.publicKey,
        creator: creator.publicKey,
        escrowMetadata
    }).rpc();

    if (isAssertion) {
        const escrowMetadataState = await program.account.escrowMetadata.fetch(escrowMetadata);
        expect(escrowMetadataState.escrow.toString()).eq(escrow.toString());
        expect(escrowMetadataState.name.toString()).eq(name.toString());
        expect(escrowMetadataState.description.toString()).eq(description.toString());
        expect(escrowMetadataState.creatorEmail.toString()).eq(creatorEmail.toString());
        expect(escrowMetadataState.recipientEmail.toString()).eq(recipientEmail.toString());
    }
}


export interface UpdateRecipientParams {
    isAssertion: boolean,
    signer: web3.Keypair,
    escrow: web3.PublicKey,
    newRecipient: web3.PublicKey,
}
export async function updateRecipient(params: UpdateRecipientParams) {
    let { isAssertion, escrow, signer, newRecipient } = params;
    const program = createLockerProgram(new Wallet(signer));
    await program.methods.updateRecipient(newRecipient).accounts({
        escrow,
        signer: signer.publicKey,
    }).rpc();

    if (isAssertion) {
        const escrowState = await program.account.escrow.fetch(escrow);
        expect(escrowState.recipient.toString()).eq(newRecipient.toString());
    }
}