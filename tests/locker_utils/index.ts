import { AnchorProvider, BN, Program, Wallet, web3 } from "@coral-xyz/anchor";
import { IDL as LockerIDL, Locker } from "../../target/types/locker";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { TokenExtensionUtil } from "./token_2022/token-extensions";
import {
  RemainingAccountsBuilder,
  RemainingAccountsType,
} from "./token_2022/remaining-accounts";
import { AccountMeta } from "@solana/web3.js";

export const LOCKER_PROGRAM_ID = new web3.PublicKey(
  "2r5VekMNiWPzi1pWwvJczrdPaZnJG59u91unSrTunwJg"
);

const MEMO_PROGRAM = new web3.PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

const ESCROW_USE_SPL_TOKEN = 0;
const ESCROW_USE_TOKEN_2022 = 1;

export function createLockerProgram(wallet?: Wallet): Program<Locker> {
  const provider = new AnchorProvider(AnchorProvider.env().connection, wallet, {
    maxRetries: 3,
  });
  provider.opts.commitment = "confirmed";
  const program = new Program<Locker>(LockerIDL, LOCKER_PROGRAM_ID, provider);
  return program;
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
  vestingStartTime: BN;
  cliffTime: BN;
  frequency: BN;
  cliffUnlockAmount: BN;
  amountPerPeriod: BN;
  numberOfPeriod: BN;
  recipient: web3.PublicKey;
  updateRecipientMode: number;
  cancelMode: number;
  tokenProgram?: web3.PublicKey;
}

export async function createVestingPlan(params: CreateVestingPlanParams) {
  let {
    isAssertion,
    tokenMint,
    ownerKeypair,
    vestingStartTime,
    cliffTime,
    frequency,
    cliffUnlockAmount,
    amountPerPeriod,
    numberOfPeriod,
    recipient,
    updateRecipientMode,
    cancelMode,
    tokenProgram,
  } = params;
  if (tokenProgram && tokenProgram != TOKEN_PROGRAM_ID) {
    throw Error("This instruction only supports TOKEN_PROGRAM_ID");
  }
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
  await program.methods
    .createVestingEscrow({
      cliffTime,
      frequency,
      cliffUnlockAmount,
      amountPerPeriod,
      numberOfPeriod,
      updateRecipientMode,
      vestingStartTime,
      cancelMode,
    })
    .accounts({
      base: baseKP.publicKey,
      senderToken,
      escrowToken,
      recipient,
      sender: ownerKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      escrow,
    })
    .preInstructions([
      createAssociatedTokenAccountInstruction(
        ownerKeypair.publicKey,
        escrowToken,
        escrow,
        tokenMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
    ])
    .signers([baseKP])
    .rpc();

  if (isAssertion) {
    const escrowState = await program.account.vestingEscrow.fetch(escrow);
    expect(escrowState.cliffTime.toString()).eq(cliffTime.toString());
    expect(escrowState.frequency.toString()).eq(frequency.toString());
    expect(escrowState.cliffUnlockAmount.toString()).eq(
      cliffUnlockAmount.toString()
    );
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
    expect(escrowState.tokenProgramFlag).eq(0);
    expect(escrowState.cancelMode).eq(cancelMode);
  }

  return escrow;
}

export interface ClaimTokenParams {
  isAssertion: boolean;
  escrow: web3.PublicKey;
  recipient: web3.Keypair;
  maxAmount: BN;
  recipientToken: web3.PublicKey;
}

export async function claimToken(params: ClaimTokenParams) {
  let { isAssertion, escrow, recipient, maxAmount, recipientToken } = params;
  const program = createLockerProgram(new Wallet(recipient));
  const escrowState = await program.account.vestingEscrow.fetch(escrow);

  const escrowToken = getAssociatedTokenAddressSync(
    escrowState.tokenMint,
    escrow,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  await program.methods
    .claim(maxAmount)
    .accounts({
      tokenProgram: TOKEN_PROGRAM_ID,
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

// V2 instructions
export async function createVestingPlanV2(params: CreateVestingPlanParams) {
  let {
    isAssertion,
    tokenMint,
    ownerKeypair,
    vestingStartTime,
    cliffTime,
    frequency,
    cliffUnlockAmount,
    amountPerPeriod,
    numberOfPeriod,
    recipient,
    updateRecipientMode,
    cancelMode,
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

  let remainingAccountsInfo = null;
  let remainingAccounts: AccountMeta[] = [];
  if (tokenProgram == TOKEN_2022_PROGRAM_ID) {
    let inputTransferHookAccounts =
      await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        program.provider.connection,
        tokenMint,
        senderToken,
        escrowToken,
        ownerKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      );

    [remainingAccountsInfo, remainingAccounts] = new RemainingAccountsBuilder()
      .addSlice(
        RemainingAccountsType.TransferHookEscrow,
        inputTransferHookAccounts
      )
      .build();
  }

  await program.methods
    .createVestingEscrowV2(
      {
        vestingStartTime,
        cliffTime,
        frequency,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        updateRecipientMode,
        cancelMode,
      },
      remainingAccountsInfo
    )
    .accounts({
      base: baseKP.publicKey,
      senderToken,
      escrowToken,
      recipient,
      tokenMint,
      sender: ownerKeypair.publicKey,
      tokenProgram,
      systemProgram: web3.SystemProgram.programId,
      escrow,
    })
    .remainingAccounts(remainingAccounts ? remainingAccounts : [])
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
    expect(escrowState.cliffTime.toString()).eq(cliffTime.toString());
    expect(escrowState.frequency.toString()).eq(frequency.toString());
    expect(escrowState.cliffUnlockAmount.toString()).eq(
      cliffUnlockAmount.toString()
    );
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
    expect(escrowState.tokenProgramFlag).eq(
      tokenProgram == TOKEN_PROGRAM_ID ? 0 : 1
    );
  }

  return escrow;
}

export interface ClaimTokenParamsV2 {
  isAssertion: boolean;
  escrow: web3.PublicKey;
  recipient: web3.Keypair;
  maxAmount: BN;
  recipientToken: web3.PublicKey;
  tokenProgram: web3.PublicKey;
}

export async function claimTokenV2(params: ClaimTokenParamsV2) {
  let { isAssertion, escrow, recipient, maxAmount, recipientToken } = params;
  const program = createLockerProgram(new Wallet(recipient));
  const escrowState = await program.account.vestingEscrow.fetch(escrow);
  const tokenProgram =
    escrowState.tokenProgramFlag == ESCROW_USE_SPL_TOKEN
      ? TOKEN_PROGRAM_ID
      : TOKEN_2022_PROGRAM_ID;

  const escrowToken = getAssociatedTokenAddressSync(
    escrowState.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  let remainingAccountsInfo = null;
  let remainingAccounts: AccountMeta[] = [];
  if (tokenProgram == TOKEN_2022_PROGRAM_ID) {
    let claimTransferHookAccounts =
      await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        program.provider.connection,
        escrowState.tokenMint,
        escrowToken,
        recipientToken,
        escrow,
        TOKEN_2022_PROGRAM_ID
      );

    [remainingAccountsInfo, remainingAccounts] = new RemainingAccountsBuilder()
      .addSlice(
        RemainingAccountsType.TransferHookEscrow,
        claimTransferHookAccounts
      )
      .build();
  }

  const tx = await program.methods
    .claimV2(maxAmount, remainingAccountsInfo)
    .accounts({
      tokenProgram,
      tokenMint: escrowState.tokenMint,
      memoProgram: MEMO_PROGRAM,
      escrow,
      escrowToken,
      recipient: recipient.publicKey,
      recipientToken,
    })
    .remainingAccounts(remainingAccounts ? remainingAccounts : [])
    .signers([recipient])
    .rpc();

  console.log("   claim token signature", tx);
}

export interface CancelVestingPlanParams {
  isAssertion: boolean;
  escrow: web3.PublicKey;
  rentReceiver: web3.PublicKey;
  creatorToken: web3.PublicKey;
  recipientToken: web3.PublicKey;
  signer: web3.Keypair;
}

export async function cancelVestingPlan(
  params: CancelVestingPlanParams,
  claimable_amount: number,
  total_amount: number
) {
  let {
    isAssertion,
    escrow,
    rentReceiver,
    creatorToken,
    recipientToken,
    signer,
  } = params;
  const program = createLockerProgram(new Wallet(signer));
  const escrowState = await program.account.vestingEscrow.fetch(escrow);
  const tokenProgram =
    escrowState.tokenProgramFlag == ESCROW_USE_SPL_TOKEN
      ? TOKEN_PROGRAM_ID
      : TOKEN_2022_PROGRAM_ID;

  const escrowToken = getAssociatedTokenAddressSync(
    escrowState.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const creator_token_balance_before = (
    await program.provider.connection.getTokenAccountBalance(creatorToken)
  ).value.amount;

  const recipient_token_balance_before = (
    await program.provider.connection.getTokenAccountBalance(recipientToken)
  ).value.amount;

  let remainingAccountsInfo = null;
  let remainingAccounts: AccountMeta[] = [];
  if (tokenProgram == TOKEN_2022_PROGRAM_ID) {
    let cancelTransferHookAccounts =
      await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        program.provider.connection,
        escrowState.tokenMint,
        escrowToken,
        recipientToken,
        escrow,
        tokenProgram
      );

    [remainingAccountsInfo, remainingAccounts] = new RemainingAccountsBuilder()
      .addSlice(
        RemainingAccountsType.TransferHookEscrow,
        cancelTransferHookAccounts
      )
      .build();
  }

  await program.methods
    .cancelVestingEscrow(remainingAccountsInfo)
    .accounts({
      escrow,
      tokenMint: escrowState.tokenMint,
      escrowToken,
      rentReceiver,
      creatorToken: creatorToken,
      recipientToken: recipientToken,
      signer: signer.publicKey,
      tokenProgram,
      memoProgram: MEMO_PROGRAM,
    })
    .remainingAccounts(remainingAccounts ? remainingAccounts : [])
    .rpc();

  if (isAssertion) {
    const escrowState = await program.account.vestingEscrow.fetch(escrow);
    expect(escrowState.cancelledAt.toNumber()).greaterThan(0);

    const escrowTokenAccount = await program.provider.connection.getAccountInfo(
      escrowToken
    );
    expect(escrowTokenAccount).eq(null);

    const creator_token_balance = (
      await program.provider.connection.getTokenAccountBalance(creatorToken)
    ).value.amount;
    expect(
      parseInt(creator_token_balance_before) + total_amount - claimable_amount
    ).eq(parseInt(creator_token_balance));

    const recipient_token_balance = (
      await program.provider.connection.getTokenAccountBalance(recipientToken)
    ).value.amount;
    expect(parseInt(recipient_token_balance_before) + claimable_amount).eq(
      parseInt(recipient_token_balance)
    );
  }
}
