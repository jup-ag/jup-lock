import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  createInitializeMint2Instruction,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundBatchWallet,
  createAndFundWallet,
  getCurrentBlockTime,
  invokeAndAssertError,
  sleep,
} from "../common";
import { createVestingPlanV3, claimTokenV3 } from "../locker_utils";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../locker_utils/merkle_tree";

const provider = anchor.AnchorProvider.env();

describe("[V3] Create vesting with spl token", () => {
  const tokenDecimal = 8;
  let mintAuthority: web3.Keypair;
  let mintKeypair: web3.Keypair;
  let TOKEN: web3.PublicKey;
  let mintAmount: bigint;

  let UserKP: web3.Keypair;
  let recipients: web3.Keypair[];
  let recipientAtas: web3.PublicKey[];
  let totalDepositAmount;
  let vestingStartTime;
  let cliffTime;
  let frequency;
  let cliffUnlockAmount;
  let amountPerPeriod;
  let numberOfPeriod;
  let totalLockedAmount;
  let leaves: any;

  let root: any;
  let proof: any;

  before(async () => {
    {
      await createAndFundWallet(provider.connection);
    }
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundBatchWallet(provider.connection);
      recipients = result.map((item: any) => item.keypair);
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

    const userToken = await createAssociatedTokenAccountIdempotent(
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
      userToken,
      mintAuthority,
      mintAmount,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    recipientAtas = [];
    for (const recipientor of recipients) {
      const recipientorAta = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        UserKP,
        TOKEN,
        recipientor.publicKey,
        {},
        TOKEN_PROGRAM_ID
      );
      recipientAtas.push(recipientorAta);
    }

    // create root & proof
    // default value
    vestingStartTime = new BN(0);
    cliffTime = new BN(1);
    frequency = new BN(1);
    cliffUnlockAmount = new BN(100_000);
    amountPerPeriod = new BN(50_000);
    numberOfPeriod = new BN(2);
    totalLockedAmount = cliffUnlockAmount.add(
      amountPerPeriod.mul(numberOfPeriod)
    );
    leaves = recipients.map((item) => {
      return {
        account: item.publicKey,
        totalLockedAmount,
        vestingStartTime,
        cliffTime,
        frequency,
      };
    });
    const user = {
      account: recipients[0].publicKey,
      totalLockedAmount,
      vestingStartTime,
      cliffTime,
      frequency,
    };
    totalDepositAmount = totalLockedAmount.muln(leaves.length);
    root = generateMerkleTreeRoot(leaves);
    proof = getMerkleTreeProof(leaves, user);
  });

  it("Full flow create Vesting plan", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_PROGRAM_ID,
      totalDepositAmount,
      root,
    });

    while (true) {
      const currentBlockTime = await getCurrentBlockTime(provider.connection);
      if (currentBlockTime > cliffTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    try {
      const claimParams = {
        recipient: recipients[0],
        recipientToken: recipientAtas[0],
        tokenMint: TOKEN,
        escrow,
        maxAmount: new BN(1_000_000),
        isAssertion: false,
        tokenProgram: TOKEN_PROGRAM_ID,
        proof,
        vestingStartTime,
        cliffTime,
        frequency,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
      };
      await claimTokenV3(claimParams);
    } catch (error) {
      console.log(error);
    }
  });

  it("All recipients able to claim spl token", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_PROGRAM_ID,
      totalDepositAmount,
      root,
    });

    while (true) {
      const currentBlockTime = await getCurrentBlockTime(provider.connection);
      if (currentBlockTime > cliffTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const recipientAta = recipientAtas[i];
      const recipientNode = {
        account: recipient.publicKey,
        totalLockedAmount,
        vestingStartTime,
        cliffTime,
        frequency,
      };
      const recipientProof = getMerkleTreeProof(leaves, recipientNode);
      try {
        const claimParams = {
          recipient: recipient,
          recipientToken: recipientAta,
          tokenMint: TOKEN,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: false,
          tokenProgram: TOKEN_PROGRAM_ID,
          proof: recipientProof,
          vestingStartTime,
          cliffTime,
          frequency,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
        };
        await claimTokenV3(claimParams);
      } catch (error) {
        console.log(error);
      }
    }
  });

  it("Fake recipient can not claim", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_PROGRAM_ID,
      totalDepositAmount,
      root,
    });

    while (true) {
      const currentBlockTime = await getCurrentBlockTime(provider.connection);
      if (currentBlockTime > cliffTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    const newRecipient = web3.Keypair.generate();
    const newRecipientAta = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      newRecipient.publicKey,
      {},
      TOKEN_PROGRAM_ID
    );
    const recipientNode = {
      account: newRecipient.publicKey,
      totalLockedAmount,
      vestingStartTime,
      cliffTime,
      frequency,
    };
    const newRecipientProof = getMerkleTreeProof(leaves, recipientNode);

    invokeAndAssertError(
      async () => {
        const claimParams = {
          recipient: newRecipient,
          recipientToken: newRecipientAta,
          tokenMint: TOKEN,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: true,
          tokenProgram: TOKEN_PROGRAM_ID,
          proof: newRecipientProof,
          vestingStartTime,
          cliffTime,
          frequency,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
        };
        await claimTokenV3(claimParams);
      },
      "Invalid merkle proof",
      true
    );
  });
});
