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
} from "../common";
import { createVestingPlanV3, createEscrowMetadataV3 } from "../locker_utils";
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

describe("[V3] Create vesting metadata", () => {
  const tokenDecimal = 8;
  let mintAuthority: web3.Keypair;
  let mintKeypair: web3.Keypair;
  let TOKEN: web3.PublicKey;
  let mintAmount: bigint;

  let UserKP: web3.Keypair;
  let recipients: web3.Keypair[];
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

    // create root & proof
    // default value
    vestingStartTime = new BN(0);
    let currentBlockTime = await getCurrentBlockTime(provider.connection);
    cliffTime = new BN(currentBlockTime).add(new BN(5));
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
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        cliffTime,
        frequency,
        vestingStartTime
      };
    });
    const user = {
      account: recipients[0].publicKey,
      cliffUnlockAmount,
      amountPerPeriod,
      numberOfPeriod,
      cliffTime,
      frequency,
      vestingStartTime
    };
    totalDepositAmount = totalLockedAmount.muln(leaves.length);
    root = generateMerkleTreeRoot(leaves);
    proof = getMerkleTreeProof(leaves, user);
  });

  it("Full flow", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 0,
      root,
    });
    console.log("Create escrow metadata");
    await createEscrowMetadataV3({
      escrow,
      name: "Jupiter lock",
      description: "This is jupiter lock",
      creatorEmail: "andrew@raccoons.dev",
      recipientEndpoint: "",
      creator: UserKP,
      isAssertion: true,
    });
  });
});
