import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime, sleep } from "../common";
import {
  claimToken,
  createLockerProgram,
  createVestingPlan,
} from "./locker_utils";
import { ADMIN, createMintTransaction } from "./locker_utils/mint";

const provider = anchor.AnchorProvider.env();

describe("[V2] Test full flow With token 2022", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
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
    extensions = [ExtensionType.TransferFeeConfig];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      false
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

  it("Full flow", async () => {
    console.log("Create vesting plan");
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlan({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      recipient: RecipientKP.publicKey,
      updateRecipientMode: 0,
      cancelMode: 0,
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
