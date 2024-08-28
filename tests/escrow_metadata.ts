import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
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

let provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";

describe("Escrow metadata", () => {
  const tokenDecimal = 8;
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let ReceipentKP: web3.Keypair;

  before(async () => {
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundWallet(provider.connection);
      ReceipentKP = result.keypair;
    }

    TOKEN = await createMint(
      provider.connection,
      UserKP,
      UserKP.publicKey,
      null,
      tokenDecimal,
      web3.Keypair.generate(),
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID
    );

    const userToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      UserKP,
      TOKEN,
      UserKP.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    // userBTC = userTokenX.address;
    await mintTo(
      provider.connection,
      UserKP,
      TOKEN,
      userToken.address,
      UserKP.publicKey,
      100 * 10 ** tokenDecimal,
      [],
      {
        commitment: "confirmed",
      },
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
      recipient: ReceipentKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 0,
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
  });
});
