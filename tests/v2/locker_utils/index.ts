import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet, web3 } from "@coral-xyz/anchor";
import { IDL as LockerIDL, Locker } from "../../../target/types/locker";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { expect } from "chai";

export const LOCKER_PROGRAM_ID = new web3.PublicKey(
  "2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg"
);

export function createLockerProgram(wallet: Wallet): Program<Locker> {
  const provider = new AnchorProvider(AnchorProvider.env().connection, wallet, {
    maxRetries: 3,
  });
  return new Program<Locker>(LockerIDL, LOCKER_PROGRAM_ID, provider);
}

export function deriveEscrow(base: web3.PublicKey, programId: web3.PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), base.toBuffer()],
    programId
  );
}

export function deriveEscrowMetadata(
  escrow: web3.PublicKey,
  programId: web3.PublicKey
) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_metadata"), escrow.toBuffer()],
    programId
  );
}

export interface CreateVestingPlanParams {
  ownerKeypair: web3.Keypair;
  tokenMint: web3.PublicKey;
  isAssertion: boolean;
  startTime: BN;
  frequency: BN;
  cliffAmount: BN;
  amountPerPeriod: BN;
  numberOfPeriod: BN;
  recipient: web3.PublicKey;
  updateRecipientMode: number;
  tokenProgram: web3.PublicKey;
}

export async function createVestingPlan(params: CreateVestingPlanParams) {
  let {
    isAssertion,
    tokenMint,
    ownerKeypair,
    startTime,
    frequency,
    cliffAmount,
    amountPerPeriod,
    numberOfPeriod,
    recipient,
    updateRecipientMode,
    tokenProgram,
  } = params;
  const program = createLockerProgram(new Wallet(ownerKeypair));

  const baseKP = web3.Keypair.generate();

  let [escrow] = deriveEscrow(baseKP.publicKey, program.programId);

  const senderToken = getAssociatedTokenAddressSync(
    tokenMint,
    ownerKeypair.publicKey,
    false,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const escrowToken = getAssociatedTokenAddressSync(
    tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await program.methods
    .createVestingEscrowV2({
      startTime,
      frequency,
      cliffAmount,
      amountPerPeriod,
      numberOfPeriod,
      updateRecipientMode,
    })
    .accounts({
      base: baseKP.publicKey,
      senderToken,
      escrowToken,
      recipient,
      mint: tokenMint,
      sender: ownerKeypair.publicKey,
      tokenProgram,
      systemProgram: web3.SystemProgram.programId,
      escrow,
    })
    .preInstructions([
      createAssociatedTokenAccountInstruction(
        ownerKeypair.publicKey,
        escrowToken,
        escrow,
        tokenMint,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
    ])
    .signers([baseKP])
    .rpc();

  if (isAssertion) {
    const escrowState = await program.account.vestingEscrow.fetch(escrow);
    expect(escrowState.startTime.toString()).eq(startTime.toString());
    expect(escrowState.frequency.toString()).eq(frequency.toString());
    expect(escrowState.cliffAmount.toString()).eq(cliffAmount.toString());
    expect(escrowState.amountPerPeriod.toString()).eq(
      amountPerPeriod.toString()
    );
    expect(escrowState.numberOfPeriod.toString()).eq(numberOfPeriod.toString());
    expect(escrowState.recipient.toString()).eq(recipient.toString());
    expect(escrowState.tokenMint.toString()).eq(tokenMint.toString());
    expect(escrowState.creator.toString()).eq(
      ownerKeypair.publicKey.toString()
    );
    expect(escrowState.base.toString()).eq(baseKP.publicKey.toString());
    expect(escrowState.updateRecipientMode).eq(updateRecipientMode);
  }

  return escrow;
}

export interface ClaimTokenParams {
  isAssertion: boolean;
  tokenMint: web3.PublicKey;
  escrow: web3.PublicKey;
  recipient: web3.Keypair;
  maxAmount: BN;
  recipientToken: web3.PublicKey;
  tokenProgram: web3.PublicKey;
}
export async function claimToken(params: ClaimTokenParams) {
  let {
    isAssertion,
    escrow,
    tokenMint,
    recipient,
    maxAmount,
    recipientToken,
    tokenProgram,
  } = params;
  const program = createLockerProgram(new Wallet(recipient));
  const escrowState = await program.account.vestingEscrow.fetch(escrow);

  const escrowToken = getAssociatedTokenAddressSync(
    escrowState.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const provider = anchor.AnchorProvider.env();

  await program.methods
    .claimV2(maxAmount)
    .accounts({
      tokenProgram,
      mint: tokenMint,
      escrow,
      escrowToken,
      recipient: recipient.publicKey,
      recipientToken,
    })
    .rpc();
}

export interface CreateEscrowMetadataParams {
  isAssertion: boolean;
  creator: web3.Keypair;
  escrow: web3.PublicKey;
  name: string;
  description: string;
  creatorEmail: string;
  recipientEmail: string;
}
export async function createEscrowMetadata(params: CreateEscrowMetadataParams) {
  let {
    isAssertion,
    escrow,
    name,
    description,
    creatorEmail,
    recipientEmail,
    creator,
  } = params;
  const program = createLockerProgram(new Wallet(creator));
  const [escrowMetadata] = deriveEscrowMetadata(escrow, program.programId);
  await program.methods
    .createVestingEscrowMetadata({
      name,
      description,
      creatorEmail,
      recipientEmail,
    })
    .accounts({
      escrow,
      systemProgram: web3.SystemProgram.programId,
      payer: creator.publicKey,
      creator: creator.publicKey,
      escrowMetadata,
    })
    .rpc();

  if (isAssertion) {
    const escrowMetadataState =
      await program.account.vestingEscrowMetadata.fetch(escrowMetadata);
    expect(escrowMetadataState.escrow.toString()).eq(escrow.toString());
    expect(escrowMetadataState.name.toString()).eq(name.toString());
    expect(escrowMetadataState.description.toString()).eq(
      description.toString()
    );
    expect(escrowMetadataState.creatorEmail.toString()).eq(
      creatorEmail.toString()
    );
    expect(escrowMetadataState.recipientEmail.toString()).eq(
      recipientEmail.toString()
    );
  }
}

export interface UpdateRecipientParams {
  isAssertion: boolean;
  signer: web3.Keypair;
  escrow: web3.PublicKey;
  newRecipient: web3.PublicKey;
  newRecipientEmail: null | string;
}
export async function updateRecipient(params: UpdateRecipientParams) {
  let { isAssertion, escrow, signer, newRecipient, newRecipientEmail } = params;
  const program = createLockerProgram(new Wallet(signer));
  let escrowMetadata = null;
  if (newRecipientEmail != null) {
    [escrowMetadata] = deriveEscrowMetadata(escrow, program.programId);
  }
  await program.methods
    .updateVestingEscrowRecipient(newRecipient, newRecipientEmail)
    .accounts({
      escrow,
      escrowMetadata,
      signer: signer.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  if (isAssertion) {
    const escrowState = await program.account.vestingEscrow.fetch(escrow);
    expect(escrowState.recipient.toString()).eq(newRecipient.toString());
    if (newRecipientEmail != null) {
      [escrowMetadata] = deriveEscrowMetadata(escrow, program.programId);
      const escrowMetadataState =
        await program.account.vestingEscrowMetadata.fetch(escrowMetadata);
      expect(escrowMetadataState.recipientEmail.toString()).eq(
        newRecipientEmail.toString()
      );
    }
  }
}