import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AccountState,
  createAssociatedTokenAccountIdempotent,
  createInitializeDefaultAccountStateInstruction,
  createInitializeInterestBearingMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferFeeConfigInstruction,
  ExtensionType,
  getMintLen,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { initializeTokenBadge } from "./index";

export const ADMIN = web3.Keypair.fromSecretKey(
  Uint8Array.from([
    158, 34, 15, 43, 215, 144, 99, 15, 49, 40, 202, 189, 244, 179, 70, 200, 156,
    140, 193, 247, 230, 82, 1, 103, 248, 52, 233, 244, 82, 52, 98, 196, 70, 116,
    166, 240, 58, 250, 204, 125, 228, 56, 121, 32, 22, 54, 214, 133, 148, 40,
    149, 8, 60, 74, 23, 212, 222, 54, 125, 78, 2, 203, 157, 229,
  ])
);

let feeBasisPoints: number;
let maxFee: bigint;

const tokenDecimal = 8;

export async function createMintTransaction(
  provider: AnchorProvider,
  UserKP: web3.Keypair,
  extensions: ExtensionType[],
  shouldMint: boolean = true,
  shouldHaveFreezeAuthority: boolean = false,
  createTokenBadge: boolean = false
) {
  // Set the decimals, fee basis points, and maximum fee
  feeBasisPoints = 100; // 1%
  maxFee = BigInt(9 * Math.pow(10, tokenDecimal)); // 9 tokens

  // Define the amount to be minted and the amount to be transferred, accounting for decimals
  let mintAmount = BigInt(1_000_000 * Math.pow(10, tokenDecimal)); // Mint 1,000,000 tokens

  let mintLen = getMintLen(extensions);
  const mintLamports =
    await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  let mintAuthority = new web3.Keypair();
  let mintKeypair = new web3.Keypair();
  let TOKEN = mintKeypair.publicKey;

  // Generate keys for transfer fee config authority and withdrawal authority
  let transferFeeConfigAuthority = new web3.Keypair();
  let withdrawWithheldAuthority = new web3.Keypair();

  const mintTransaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: UserKP.publicKey,
      newAccountPubkey: TOKEN,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  mintTransaction.add(
    ...createExtensionMintIx(
      extensions,
      UserKP,
      TOKEN,
      transferFeeConfigAuthority,
      withdrawWithheldAuthority
    )
  );

  mintTransaction.add(
    createInitializeMintInstruction(
      TOKEN,
      tokenDecimal,
      mintAuthority.publicKey,
      shouldHaveFreezeAuthority ? mintAuthority.publicKey : null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(
    provider.connection,
    mintTransaction,
    [UserKP, mintKeypair],
    undefined
  );

  if (createTokenBadge) {
    await initializeTokenBadge({
      isAssertion: true,
      ownerKeypair: ADMIN,
      mint: TOKEN,
    });
  }

  const userToken = await createAssociatedTokenAccountIdempotent(
    provider.connection,
    UserKP,
    TOKEN,
    UserKP.publicKey,
    {},
    TOKEN_2022_PROGRAM_ID
  );

  if (shouldMint) {
    await mintTo(
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
  }

  return TOKEN;
}

function createExtensionMintIx(
  extensions: ExtensionType[],
  UserKP: web3.Keypair,
  TOKEN: web3.PublicKey,
  transferFeeConfigAuthority: web3.Keypair,
  withdrawWithheldAuthority: web3.Keypair
): web3.TransactionInstruction[] {
  const ix = [];

  if (extensions.includes(ExtensionType.TransferFeeConfig)) {
    ix.push(
      createInitializeTransferFeeConfigInstruction(
        TOKEN,
        transferFeeConfigAuthority.publicKey,
        withdrawWithheldAuthority.publicKey,
        feeBasisPoints,
        maxFee,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  if (extensions.includes(ExtensionType.InterestBearingConfig)) {
    ix.push(
      createInitializeInterestBearingMintInstruction(
        TOKEN,
        UserKP.publicKey,
        10,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  if (extensions.includes(ExtensionType.DefaultAccountState)) {
    ix.push(
      createInitializeDefaultAccountStateInstruction(
        TOKEN, // Mint Account address
        AccountState.Frozen, // Default AccountState
        TOKEN_2022_PROGRAM_ID // Token Extension Program ID
      )
    );
  }

  if (extensions.includes(ExtensionType.PermanentDelegate)) {
    ix.push(
      createInitializePermanentDelegateInstruction(
        TOKEN, // Mint Account address
        ADMIN.publicKey, // Designated Permanent Delegate
        TOKEN_2022_PROGRAM_ID // Token Extension Program ID
      )
    );
  }

  if (extensions.includes(ExtensionType.MintCloseAuthority)) {
    ix.push(
      createInitializeMintCloseAuthorityInstruction(
        TOKEN, // Mint Account address
        ADMIN.publicKey, // Designated Close Authority
        TOKEN_2022_PROGRAM_ID // Token Extension Program ID
      )
    );
  }

  return ix;
}