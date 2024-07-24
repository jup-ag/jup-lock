import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundWallet,
  getCurrentBlockTime,
  sleep,
} from "./common";
import { claimToken, createLockerProgram, createVestingPlan } from "./locker_utils";


const provider = anchor.AnchorProvider.env();

describe("Full flow", () => {
  const tokenDecimal = 8;
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let ReceipentKP: web3.Keypair;
  let ReceipentToken: web3.PublicKey;

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
      null,
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

    const receipentToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      UserKP,
      TOKEN,
      ReceipentKP.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    ReceipentToken = receipentToken.address;
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
    let currentBlockTime = await getCurrentBlockTime(program.provider.connection);
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
      recipient: ReceipentKP.publicKey,
    });


    while (true) {
      const currentBlockTime = await getCurrentBlockTime(program.provider.connection);
      if (currentBlockTime > startTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    console.log("Claim token");
    await claimToken({
      recipient: ReceipentKP,
      recipientToken: ReceipentToken,
      escrow,
      maxAmount: new BN(1_000_000),
      isAssertion: true,
    })
  });
});
