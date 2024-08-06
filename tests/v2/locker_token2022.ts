import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountIdempotent,
  ExtensionType,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime, sleep } from "../common";
import {
  claimToken,
  createLockerProgram,
  createVestingPlan,
} from "./locker_utils";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();

describe("[V2] Full flow", () => {
  const tokenDecimal = 8;
  let mintAuthority: web3.Keypair;
  let mintKeypair: web3.Keypair;
  let TOKEN: web3.PublicKey;

  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair;
  let RecipientToken: web3.PublicKey;

  let transferFeeConfigAuthority: web3.Keypair;
  let withdrawWithheldAuthority: web3.Keypair;

  let extensions: ExtensionType[];
  let mintLen: number;

  let feeBasisPoints: number;
  let maxFee: bigint;

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

    RecipientToken = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      RecipientKP.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
    );
  });

  it("Full flow With token 2022", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const startTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      startTime,
      frequency: new BN(1),
      cliffAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    while (true) {
      const currentBlockTime = await getCurrentBlockTime(
        program.provider.connection
      );
      if (currentBlockTime > startTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    console.log("Claim token");
    try {
      await claimToken({
        recipient: RecipientKP,
        recipientToken: RecipientToken,
        tokenMint: TOKEN,
        escrow,
        maxAmount: new BN(1_000_000),
        isAssertion: true,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      });
    } catch (error) {
      console.log(error);
    }
  });
});
