import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createInitializeMint2Instruction,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundWallet,
  getCurrentBlockTime,
  invokeAndAssertError,
  sleep,
} from "../common";
import {
  cancelVestingPlan,
  createVestingPlanV2,
  createLockerProgram,
} from "../locker_utils";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";

describe("[V2] Cancel with SPL Token", () => {
  const tokenDecimal = 8;
  let mintAuthority: web3.Keypair;
  let mintKeypair: web3.Keypair;
  let TOKEN: web3.PublicKey;

  let UserKP: web3.Keypair;
  let UserToken: web3.PublicKey;
  let RecipientKP: web3.Keypair;
  let RecipientToken: web3.PublicKey;

  let mintAmount: bigint;

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

    mintAmount = BigInt(1_000_000 * Math.pow(10, tokenDecimal)); // Mint 1,000,000 tokens

    // Step 2 - Create a New Token
    const mintLamports =
      await provider.connection.getMinimumBalanceForRentExemption(82);
    const mintTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: UserKP.publicKey,
        newAccountPubkey: TOKEN,
        space: 82,
        lamports: mintLamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        TOKEN, // Mint account
        tokenDecimal, // Decimals
        mintAuthority.publicKey, // Mint authority
        null, // Freeze authority
        TOKEN_PROGRAM_ID // Token program ID
      )
    );
    await sendAndConfirmTransaction(
      provider.connection,
      mintTransaction,
      [UserKP, mintKeypair],
      undefined
    );

    UserToken = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      UserKP.publicKey,
      {},
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      provider.connection,
      UserKP,
      TOKEN,
      UserToken,
      mintAuthority,
      mintAmount,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    RecipientToken = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      RecipientKP.publicKey,
      {},
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  });
  it("No one is able to cancel", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV2({
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
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    console.log("Cancel vesting plan");
    const newRecipient = web3.Keypair.generate();
    invokeAndAssertError(
      async () => {
        await cancelVestingPlan(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            recipientToken: RecipientToken,
            signer: UserKP,
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );

    invokeAndAssertError(
      async () => {
        await cancelVestingPlan(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            recipientToken: RecipientToken,
            signer: RecipientKP,
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );
  });

  it("Creator is able to cancel", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV2({
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
      cancelMode: 1,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    console.log("Cancel Vesting Plan");
    const newRecipient = web3.Keypair.generate();
    invokeAndAssertError(
      async () => {
        await cancelVestingPlan(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            recipientToken: RecipientToken,
            signer: RecipientKP,
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );

    await cancelVestingPlan(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        recipientToken: RecipientToken,
        signer: UserKP,
      },
      0,
      200_000
    );
  });

  it("Recipient is able to cancel", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV2({
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
      cancelMode: 2,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    console.log("Cancel Vesting Plan");
    const newRecipient = web3.Keypair.generate();
    invokeAndAssertError(
      async () => {
        await cancelVestingPlan(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            recipientToken: RecipientToken,
            signer: UserKP,
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );

    await cancelVestingPlan(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        recipientToken: RecipientToken,
        signer: RecipientKP,
      },
      0,
      200_000
    );
  });

  it("Creator and Recipient is able to cancel, called by creator", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV2({
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
      cancelMode: 3,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    console.log("Cancel Vesting Plan");
    await cancelVestingPlan(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        recipientToken: RecipientToken,
        signer: UserKP,
      },
      0,
      200_000
    );
  });

  it("Creator and Recipient is able to cancel, called by recipient", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV2({
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
      cancelMode: 3,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    console.log("Cancel Vesting Plan");
    await cancelVestingPlan(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        recipientToken: RecipientToken,
        signer: RecipientKP,
      },
      0,
      200_000
    );
  });

  it("Creator is able to cancel after cliff time", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV2({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(10),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 1,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    while (true) {
      const currentBlockTime = await getCurrentBlockTime(
        program.provider.connection
      );
      if (currentBlockTime > cliffTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    console.log("Cancel Vesting Plan");
    await cancelVestingPlan(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        recipientToken: RecipientToken,
        signer: UserKP,
      },
      100_000,
      200_000
    );
  });
});
