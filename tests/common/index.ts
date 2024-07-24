import { web3, Wallet } from "@coral-xyz/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export * from "./asserter";

export async function createAndFundWallet(
  connection: web3.Connection,
  keypair?: web3.Keypair
) {
  if (!keypair) {
    keypair = web3.Keypair.generate();
  }

  const tx = await connection.requestAirdrop(
    keypair.publicKey,
    1000 * web3.LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(tx, "confirmed");

  const wallet = new Wallet(keypair);
  return {
    keypair,
    wallet,
  };
}

export const encodeU32 = (num: number): Buffer => {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(num);
  return buf;
};

export const encodeU64 = (num: number): Buffer => {
  const buf = Buffer.alloc(8);
  buf.writeBigUint64LE(BigInt(num));
  return buf;
};

export async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export const SET_COMPUTE_UNIT_LIMIT_IX =
  web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_400_000,
  });

export const createMintIfNotExists = async (
  connection: web3.Connection,
  payer: web3.Keypair,
  mintAuthority: web3.PublicKey,
  decimals: number,
  mintKeypair: web3.Keypair,
  tokenProgramId: web3.PublicKey
) => {
  const mint = await connection.getAccountInfo(mintKeypair.publicKey);
  if (!mint) {
    return await createMint(
      connection,
      payer,
      mintAuthority,
      null,
      decimals,
      mintKeypair,
      null,
      tokenProgramId
    );
  }
  return mintKeypair.publicKey;
};
export const mintTokenTo = async (connection: web3.Connection, mintAuthority: web3.Keypair, tokenMint: web3.PublicKey, owner: web3.PublicKey, amount: number) => {
  const userToken = await getOrCreateAssociatedTokenAccount(
    connection,
    mintAuthority,
    tokenMint,
    owner,
    false,
    "confirmed",
    {
      commitment: "confirmed",
    },
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  await mintTo(
    connection,
    mintAuthority,
    tokenMint,
    userToken.address,
    mintAuthority.publicKey,
    amount,
    [],
    {
      commitment: "confirmed",
    },
    TOKEN_PROGRAM_ID
  );
}

export const getCurrentBlockTime = async (connection: web3.Connection) => {
  // TODO fetch clock account can help to reduce rpc call
  const currentSlot = await connection.getSlot();
  const currentBlockTime = await connection.getBlockTime(currentSlot);
  return currentBlockTime;
}