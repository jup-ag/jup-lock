import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  ExtensionType,
  getMintLen,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundWallet,
  getCurrentBlockTime,
  invokeAndAssertError,
} from "../common";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createEscrowMetadata,
  createLockerProgram,
  createVestingPlan,
  updateRecipient,
} from "../locker_utils/token_2022";

const provider = anchor.AnchorProvider.env();

describe("[V2] Update recipient", () => {
  const tokenDecimal = 8;
  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair;
  let mintAuthority: web3.Keypair;
  let mintKeypair: web3.Keypair;
  let TOKEN: web3.PublicKey;

  let transferFeeConfigAuthority: web3.Keypair;
  let withdrawWithheldAuthority: web3.Keypair;

  let extensions: ExtensionType[];
  let mintLen: number;

  let feeBasisPoints: number;
  let maxFee: bigint;

  // Define the amount to be minted and the amount to be transferred, accounting for decimals
  let mintAmount: bigint;
  let transferAmount: bigint;

  before(async () => {
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundWallet(provider.connection);
      RecipientKP = result.keypair;
    }

    mintAuthority = new web3.Keypair();
    mintKeypair = new web3.Keypair();
    TOKEN = mintKeypair.publicKey;

    // Generate keys for transfer fee config authority and withdrawal authority
    transferFeeConfigAuthority = new web3.Keypair();
    withdrawWithheldAuthority = new web3.Keypair();

    // Define the extensions to be used by the mint
    extensions = [ExtensionType.TransferFeeConfig];

    // Calculate the length of the mint
    mintLen = getMintLen(extensions);

    // Set the decimals, fee basis points, and maximum fee
    feeBasisPoints = 100; // 1%
    maxFee = BigInt(9 * Math.pow(10, tokenDecimal)); // 9 tokens

    // Define the amount to be minted and the amount to be transferred, accounting for decimals
    mintAmount = BigInt(1_000_000 * Math.pow(10, tokenDecimal)); // Mint 1,000,000 tokens
    transferAmount = BigInt(1_000 * Math.pow(10, tokenDecimal)); // Transfer 1,000 tokens

    // Step 2 - Create a New Token
    const mintLamports =
      await provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const mintTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: UserKP.publicKey,
        newAccountPubkey: TOKEN,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        TOKEN,
        transferFeeConfigAuthority.publicKey,
        withdrawWithheldAuthority.publicKey,
        feeBasisPoints,
        maxFee,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        TOKEN,
        tokenDecimal,
        mintAuthority.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(
      provider.connection,
      mintTransaction,
      [UserKP, mintKeypair],
      undefined
    );

    const userToken = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      UserKP.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
    );
    const mintSig = await mintTo(
      provider.connection,
      UserKP,
      TOKEN,
      userToken,
      mintAuthority,
      mintAmount,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
  });

  it("No one is able to update", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    console.log("Update recipient");
    const newRecipient = web3.Keypair.generate();
    invokeAndAssertError(
      async () => {
        await updateRecipient({
          escrow,
          newRecipient: newRecipient.publicKey,
          isAssertion: true,
          signer: UserKP,
          newRecipientEmail: null,
        });
      },
      "Not permit to do this action",
      true
    );

    invokeAndAssertError(
      async () => {
        await updateRecipient({
          escrow,
          newRecipient: newRecipient.publicKey,
          isAssertion: true,
          signer: RecipientKP,
          newRecipientEmail: null,
        });
      },
      "Not permit to do this action",
      true
    );
  });

  it("Creator is able to update recipient", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 1,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    console.log("Update recipient");
    const newRecipient = web3.Keypair.generate();
    invokeAndAssertError(
      async () => {
        await updateRecipient({
          escrow,
          newRecipient: newRecipient.publicKey,
          isAssertion: true,
          signer: RecipientKP,
          newRecipientEmail: null,
        });
      },
      "Not permit to do this action",
      true
    );

    await updateRecipient({
      escrow,
      newRecipient: newRecipient.publicKey,
      isAssertion: true,
      signer: UserKP,
      newRecipientEmail: null,
    });
  });

  it("Recipient is able to update recipient", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 2,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    console.log("Update recipient");
    const newRecipient = web3.Keypair.generate();
    invokeAndAssertError(
      async () => {
        await updateRecipient({
          escrow,
          newRecipient: newRecipient.publicKey,
          isAssertion: true,
          signer: UserKP,
          newRecipientEmail: null,
        });
      },
      "Not permit to do this action",
      true
    );

    await updateRecipient({
      escrow,
      newRecipient: newRecipient.publicKey,
      isAssertion: true,
      signer: RecipientKP,
      newRecipientEmail: null,
    });
  });

  it("Creator and Recipient is able to update recipient", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 3,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    console.log("Update recipient");
    await updateRecipient({
      escrow,
      newRecipient: RecipientKP.publicKey,
      isAssertion: true,
      signer: UserKP,
      newRecipientEmail: null,
    });

    await updateRecipient({
      escrow,
      newRecipient: RecipientKP.publicKey,
      isAssertion: true,
      signer: RecipientKP,
      newRecipientEmail: null,
    });
  });

  it("Update both recipient and recipient email", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 3,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    console.log("Create escrow metadata");
    await createEscrowMetadata({
      escrow,
      name: "Jupiter lock",
      description: "This is jupiter lock",
      creatorEmail: "andrew@raccoons.dev",
      recipientEmail: "max@raccoons.dev",
      creator: UserKP,
      isAssertion: true,
    });

    console.log("Update recipient with bigger email size");
    await updateRecipient({
      escrow,
      newRecipient: RecipientKP.publicKey,
      isAssertion: true,
      signer: UserKP,
      newRecipientEmail: "maximillian@raccoons.dev",
    });

    console.log("Update recipient with smaller email size");
    await updateRecipient({
      escrow,
      newRecipient: RecipientKP.publicKey,
      isAssertion: true,
      signer: UserKP,
      newRecipientEmail: "max@raccoons.dev",
    });
  });
});
