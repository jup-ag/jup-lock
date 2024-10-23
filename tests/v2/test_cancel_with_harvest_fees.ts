import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  ExtensionType,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundWallet,
  getCurrentBlockTime,
  invokeAndAssertError,
  sleep,
} from "../common";
import {
  createVestingPlanV2,
  cancelVestingPlan,
  createLockerProgram,
} from "../locker_utils";
import { ADMIN, createMintTransaction } from "../locker_utils/token_2022/mint";

const provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";
const FEE = 100; // 100 BPS
const MAX_FEE = 10000; 

describe("[V2] Cancel, with transfer fees and harvesting", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let UserToken: web3.PublicKey;
  let RecipientKP: web3.Keypair;
  let RecipientToken: web3.PublicKey;

  let extensions: ExtensionType[];

  before(async () => {
    {
      await createAndFundWallet(provider.connection, ADMIN);
    }
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundWallet(provider.connection);
      RecipientKP = result.keypair;
    }

    // Define the extensions to be used by the mint
    extensions = [ExtensionType.TransferHook, ExtensionType.TransferFeeConfig];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      false
    );

    UserToken = await getAssociatedTokenAddress(
      TOKEN,
      UserKP.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    RecipientToken = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      RecipientKP.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
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
      frequency: new BN(10),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    console.log("Cancel vesting plan");
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
      frequency: new BN(10),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 1,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    console.log("Cancel Vesting Plan");
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
      frequency: new BN(10),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 2,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      frequency: new BN(10),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 3,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      frequency: new BN(10),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 3,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      tokenProgram: TOKEN_2022_PROGRAM_ID,
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
