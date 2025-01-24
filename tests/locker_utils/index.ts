import {
  AnchorProvider,
  BN,
  Program,
  setProvider,
  Wallet,
  web3,
  workspace,
} from "@coral-xyz/anchor";
import { Locker } from "../../target/types/locker";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  calculateEpochFee,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getEpochFee,
  getMint,
  getOrCreateAssociatedTokenAccount,
  getTransferFeeConfig,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import { TokenExtensionUtil } from "./token_2022/token-extensions";
import {
  RemainingAccountsBuilder,
  RemainingAccountsType,
} from "./token_2022/remaining-accounts";
import { AccountMeta, ComputeBudgetProgram } from "@solana/web3.js";
import { encodeU64, getCurrentEpoch, getTokenBalance } from "../common";

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

  // setProvider(provider);

  return workspace.Locker as Program<Locker>;
}

export function deriveEscrow(base: web3.PublicKey, programId: web3.PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), base.toBuffer()],
    programId
  );
}

export function deriveRootEscrow(
  base: web3.PublicKey,
  mint: web3.PublicKey,
  version: number,
) {
  let [pk, _] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("root_escrow"), base.toBuffer(), mint.toBuffer(), encodeU64(version)],
    LOCKER_PROGRAM_ID
  );
  return pk
}

export function deriveBase(
  rootEscrow: web3.PublicKey,
  recipient: web3.PublicKey,
) {
  let [pk, _] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("base"), rootEscrow.toBuffer(), recipient.toBuffer()],
    LOCKER_PROGRAM_ID
  );
  return pk
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
    .signers([baseKP, ownerKeypair])
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
    .signers([recipient])
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
    .signers([creator])
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
    .signers([signer])
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
    .signers([baseKP, ownerKeypair])
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
}

// Root escrow instructions
export interface CreateRootEscrowParams {
  isAssertion: boolean;
  tokenMint: web3.PublicKey;
  ownerKeypair: web3.Keypair;
  maxClaimAmount: BN;
  maxEscrow: BN,
  version: BN,
  root: Buffer;
  tokenProgram: web3.PublicKey;
}

export async function createRootEscrow(params: CreateRootEscrowParams) {
  let {
    isAssertion,
    tokenMint,
    ownerKeypair,
    maxClaimAmount,
    maxEscrow,
    version,
    root,
    tokenProgram,
  } = params;
  const program = createLockerProgram(new Wallet(ownerKeypair));

  const baseKP = web3.Keypair.generate();

  let rootEscrow = deriveRootEscrow(baseKP.publicKey, tokenMint, version.toNumber());

  await program.methods
    .createRootEscrow(
      {
        maxClaimAmount,
        maxEscrow,
        version,
        root: Array.from(new Uint8Array(root)),
      },
    )
    .accounts({
      base: baseKP.publicKey,
      rootEscrow,
      tokenMint,
      creator: ownerKeypair.publicKey,
      tokenProgram,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([baseKP, ownerKeypair])
    .rpc().catch(console.log).then(console.log);

  if (isAssertion) {
    const rootEscrowState = await program.account.rootEscrow.fetch(rootEscrow);
    expect(rootEscrowState.tokenMint.toString()).eq(tokenMint.toString());
    expect(rootEscrowState.creator.toString()).eq(
      ownerKeypair.publicKey.toString()
    );
    expect(rootEscrowState.base.toString()).eq(baseKP.publicKey.toString());
    expect(rootEscrowState.tokenProgramFlag).eq(
      tokenProgram == TOKEN_PROGRAM_ID ? 0 : 1
    );
    expect(rootEscrowState.maxClaimAmount.toNumber()).eq(
      maxClaimAmount.toNumber()
    );
    expect(rootEscrowState.maxEscrow.toNumber()).eq(
      maxEscrow.toNumber()
    );
  }

  return rootEscrow;
}


export interface FundRootEscrowParams {
  isAssertion: boolean;
  rootEscrow: web3.PublicKey,
  payerKP: web3.Keypair;
}

export async function fundRootEscrow(params: FundRootEscrowParams) {
  let { isAssertion, rootEscrow, payerKP } = params;
  const program = createLockerProgram(new Wallet(payerKP));
  let rootEscrowState = await program.account.rootEscrow.fetch(rootEscrow);
  let tokenProgram = rootEscrowState.tokenProgramFlag == 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const payerToken = getAssociatedTokenAddressSync(
    rootEscrowState.tokenMint,
    payerKP.publicKey,
    false,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const rootEscrowToken = getAssociatedTokenAddressSync(
    rootEscrowState.tokenMint,
    rootEscrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  let remainingAccountsInfo = null;
  let remainingAccounts: AccountMeta[] = [];
  if (rootEscrowState.tokenProgramFlag == 1) {
    let inputTransferHookAccounts =
      await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        program.provider.connection,
        rootEscrowState.tokenMint,
        payerToken,
        rootEscrowToken,
        payerKP.publicKey,
        TOKEN_2022_PROGRAM_ID
      );

    [remainingAccountsInfo, remainingAccounts] = new RemainingAccountsBuilder()
      .addSlice(
        RemainingAccountsType.TransferHookEscrow,
        inputTransferHookAccounts
      )
      .build();
  }
  await program.methods.fundRootEscrow(rootEscrowState.maxClaimAmount, remainingAccountsInfo).accounts({
    rootEscrow,
    tokenMint: rootEscrowState.tokenMint,
    rootEscrowToken,
    payer: payerKP.publicKey,
    payerToken,
    tokenProgram,
    systemProgram: web3.SystemProgram.programId,
    associateTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  }).remainingAccounts(remainingAccounts ? remainingAccounts : []).signers([payerKP]).rpc().catch(console.log).then(console.log);
}

export interface CreateVestingEscrowFromRootParams {
  isAssertion: boolean;
  rootEscrow: web3.PublicKey;
  vestingStartTime: BN;
  cliffTime: BN;
  frequency: BN;
  cliffUnlockAmount: BN;
  amountPerPeriod: BN;
  numberOfPeriod: BN;
  updateRecipientMode: number,
  cancelMode: number,
  recipient: web3.PublicKey;
  proof: Array<number>[];
  payerKP: web3.Keypair;
}

export async function createVestingEscrowFromRoot(params: CreateVestingEscrowFromRootParams) {
  let {
    isAssertion,
    rootEscrow,
    frequency,
    vestingStartTime,
    recipient,
    cliffTime,
    amountPerPeriod,
    proof,
    numberOfPeriod,
    cliffUnlockAmount,
    updateRecipientMode,
    cancelMode,
    payerKP,
  } = params;
  const program = createLockerProgram(new Wallet(payerKP));
  const rootEscrowState = await program.account.rootEscrow.fetch(rootEscrow);
  let base = deriveBase(rootEscrow, recipient);
  let [escrow] = deriveEscrow(base, LOCKER_PROGRAM_ID);

  const tokenProgram =
    rootEscrowState.tokenProgramFlag == ESCROW_USE_SPL_TOKEN
      ? TOKEN_PROGRAM_ID
      : TOKEN_2022_PROGRAM_ID;

  const escrowToken = getAssociatedTokenAddressSync(
    rootEscrowState.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const rootEscrowToken = getAssociatedTokenAddressSync(
    rootEscrowState.tokenMint,
    rootEscrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  let remainingAccountsInfo = null;
  let remainingAccounts: AccountMeta[] = [];
  if (rootEscrowState.tokenProgramFlag == 1) {
    let inputTransferHookAccounts =
      await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        program.provider.connection,
        rootEscrowState.tokenMint,
        rootEscrowToken,
        escrowToken,
        payerKP.publicKey,
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
    .createVestingEscrowFromRoot({
      vestingStartTime,
      cliffTime,
      frequency,
      amountPerPeriod,
      numberOfPeriod,
      cliffUnlockAmount,
      updateRecipientMode,
      cancelMode,
    }, proof, remainingAccountsInfo)
    .accounts({
      rootEscrow,
      base,
      escrow,
      escrowToken,
      rootEscrowToken,
      tokenMint: rootEscrowState.tokenMint,
      payer: payerKP.publicKey,
      recipient,
      tokenProgram,
      systemProgram: web3.SystemProgram.programId,
      associateTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).remainingAccounts(remainingAccounts ? remainingAccounts : []).signers([payerKP])
    .rpc().catch(console.log).then(console.log);

  if (isAssertion) {
    let escrowState = await program.account.vestingEscrow.fetch(escrow);
    expect(escrowState.creator.toString()).eq(rootEscrowState.creator.toString());
    expect(escrowState.vestingStartTime.toString()).eq(vestingStartTime.toString());
    expect(escrowState.cliffTime.toString()).eq(cliffTime.toString());
    expect(escrowState.frequency.toString()).eq(frequency.toString());
    expect(escrowState.amountPerPeriod.toString()).eq(amountPerPeriod.toString());
    expect(escrowState.numberOfPeriod.toString()).eq(numberOfPeriod.toString());
    expect(escrowState.cliffUnlockAmount.toString()).eq(cliffUnlockAmount.toString());
    expect(escrowState.updateRecipientMode.toString()).eq(updateRecipientMode.toString());
    expect(escrowState.cancelMode.toString()).eq(cancelMode.toString());
    expect(escrowState.recipient.toString()).eq(recipient.toString());
  }
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
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      }),
    ])
    .remainingAccounts(remainingAccounts ? remainingAccounts : [])
    .signers([signer])
    .rpc();

  let creator_fee = 0;
  let claimer_fee = 0;
  if (tokenProgram == TOKEN_2022_PROGRAM_ID) {
    const feeConfig = getTransferFeeConfig(
      await getMint(
        program.provider.connection,
        escrowState.tokenMint,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
    );
    const epoch = BigInt(await getCurrentEpoch(program.provider.connection));
    creator_fee = feeConfig
      ? Number(
        calculateEpochFee(
          feeConfig,
          epoch,
          BigInt(total_amount - claimable_amount)
        )
      )
      : 0;
    claimer_fee = feeConfig
      ? Number(calculateEpochFee(feeConfig, epoch, BigInt(claimable_amount)))
      : 0;
  }

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
      parseInt(creator_token_balance_before) +
      total_amount -
      claimable_amount -
      creator_fee
    ).eq(parseInt(creator_token_balance));

    const recipient_token_balance = (
      await program.provider.connection.getTokenAccountBalance(recipientToken)
    ).value.amount;
    expect(
      parseInt(recipient_token_balance_before) + claimable_amount - claimer_fee
    ).eq(parseInt(recipient_token_balance));
  }
}

export interface CloseVestingEscrowParams {
  isAssertion: boolean;
  creator: web3.Keypair;
  escrow: web3.PublicKey;
}

export async function closeVestingEscrow(params: CloseVestingEscrowParams) {
  let { isAssertion, escrow, creator } = params;
  const program = createLockerProgram(new Wallet(creator));
  let [escrowMetadata] = deriveEscrowMetadata(escrow, program.programId);
  let escrowState = await program.account.vestingEscrow.fetch(escrow);

  let tokenProgram =
    escrowState.tokenProgramFlag == 0
      ? TOKEN_PROGRAM_ID
      : TOKEN_2022_PROGRAM_ID;
  const escrowToken = getAssociatedTokenAddressSync(
    escrowState.tokenMint,
    escrow,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const creatorToken = getAssociatedTokenAddressSync(
    escrowState.tokenMint,
    creator.publicKey,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  let remainingAccountsInfo = null;
  let remainingAccounts: AccountMeta[] = [];
  if (escrowState.tokenProgramFlag == 1) {
    let cancelTransferHookAccounts =
      await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        program.provider.connection,
        escrowState.tokenMint,
        escrowToken,
        creatorToken,
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
    .closeVestingEscrow(remainingAccountsInfo)
    .accounts({
      escrow,
      escrowToken,
      creatorToken,
      memoProgram: MEMO_PROGRAM,
      escrowMetadata,
      tokenMint: escrowState.tokenMint,
      tokenProgram,
      creator: creator.publicKey,
    })
    .signers([creator])
    .remainingAccounts(remainingAccounts)
    .rpc();

  if (isAssertion) {
    let escrowStateAfter = await program.account.vestingEscrow.fetchNullable(
      escrow
    );
    expect(escrowStateAfter).eq(null);
    let escrowMetadataState =
      await program.account.vestingEscrowMetadata.fetchNullable(escrow);
    expect(escrowMetadataState).eq(null);
    let escrowTokenState = await program.provider.connection.getAccountInfo(
      escrowToken
    );
    expect(escrowTokenState).eq(null);
  }
}

export interface VestingEcrow {
  recipient: web3.PublicKey,
  vestingStartTime: BN;
  cliffTime: BN;
  frequency: BN;
  cliffUnlockAmount: BN;
  amountPerPeriod: BN;
  numberOfPeriod: BN;
  updateRecipientMode: number,
  cancelMode: number,
}

export function getTotalDepsitAmount(escrow: VestingEcrow) {
  return escrow.cliffUnlockAmount.add(escrow.numberOfPeriod.mul(escrow.amountPerPeriod))
}

export function getMaxClaimAmount(allEscrows: VestingEcrow[]) {
  let sum = new BN(0)
  for (let i = 0; i < allEscrows.length; i++) {
    sum = sum.add(getTotalDepsitAmount(allEscrows[i]))
  }
  return sum
}