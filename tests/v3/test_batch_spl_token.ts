import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  createInitializeMint2Instruction,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundBatchWallet, createAndFundWallet, getCurrentBlockTime, sleep } from "../common";
import {
  createLockerProgram,
  createVestingPlanV3,
  claimTokenV3,
} from "../locker_utils";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../common/merkleTree";

const provider = anchor.AnchorProvider.env();

describe("[V3] Batch create vesting with Spl Token", () => {
    const tokenDecimal = 8;
    let mintAuthority: web3.Keypair;
    let mintKeypair: web3.Keypair;
    let TOKEN: web3.PublicKey;
  
    let UserKP: web3.Keypair;
    let RecipientKP: web3.Keypair[];
    let RecipientToken: web3.PublicKey;
  
    let mintAmount: bigint;

  let root: any;
  let proof: any;

  before(async () => {
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundBatchWallet(provider.connection);
      RecipientKP = result.map((item: any) => item.keypair);
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

    RecipientToken = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      RecipientKP[0].publicKey,
      {},
      TOKEN_PROGRAM_ID
    );

    const recipientPubkeys = RecipientKP.map((item: any) => item.publicKey);
    root = generateMerkleTreeRoot(recipientPubkeys);
    proof = getMerkleTreeProof(recipientPubkeys, RecipientKP[0].publicKey)
  });

  it("Batch Create Vesting plan", async () => {
    console.log("Batch create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 0,
      cancelMode: 0,
      tokenProgram: TOKEN_PROGRAM_ID,
      root,
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

    console.log("Claim token");
    try {
      await claimTokenV3({
        recipient: RecipientKP[0],
        recipientToken: RecipientToken,
        escrow,
        maxAmount: new BN(1_000_000),
        isAssertion: true,
        tokenProgram: TOKEN_PROGRAM_ID,
        proof,
      });
    } catch (error) {
      console.log(error);
    }
  });
});
