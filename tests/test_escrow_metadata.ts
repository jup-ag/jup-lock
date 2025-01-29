import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  createInitializeMint2Instruction,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime } from "./common";
import {
  createEscrowMetadata,
  createLockerProgram,
  createVestingPlan,
} from "./locker_utils";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

let provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";

describe("Escrow metadata", () => {
  const tokenDecimal = 8;
  let mintAuthority: web3.Keypair;
  let mintKeypair: web3.Keypair;
  let TOKEN: web3.PublicKey;

  let UserKP: web3.Keypair;
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
  });
  it("Full flow", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      vestingStartTime: new BN(0),
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 0,
    });

    console.log("Create escrow metadata");
    await createEscrowMetadata({
      escrow,
      name: "Jupiter lock",
      description: "This is jupiter lock",
      creatorEmail: "andrew@raccoons.dev",
      recipientEndpoint: "max@raccoons.dev",
      creator: UserKP,
      isAssertion: true,
    });
  });
});
