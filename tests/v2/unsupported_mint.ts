import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import { ExtensionType, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime } from "../common";
import { createLockerProgram, createVestingPlan } from "./locker_utils";
import { assert } from "chai";
import { ADMIN, createMintTransaction } from "./locker_utils/mint";

const provider = anchor.AnchorProvider.env();

describe("[V2] Test supported/unsupported Token Mint", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair;

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
  });

  it("[FAIL] unsupported InterestBearingConfig", async () => {
    // Define the extensions to be used by the mint
    extensions = [ExtensionType.InterestBearingConfig];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("[FAIL] unsupported DefaultAccountState", async () => {
    // Define the extensions to be used by the mint
    extensions = [ExtensionType.DefaultAccountState];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      false,
      true
    );

    await check(TOKEN);
  });

  it("[FAIL] unsupported FreezeAuthority", async () => {
    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      false,
      true
    );

    await check(TOKEN);
  });

  it("[FAIL] unsupported PermanentDelegate", async () => {
    extensions = [ExtensionType.PermanentDelegate];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("[FAIL] unsupported MintCloseAuthority", async () => {
    extensions = [ExtensionType.MintCloseAuthority];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("[FAIL] unsupported TransferHook", async () => {
    extensions = [ExtensionType.TransferHook];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  async function check(TOKEN: web3.PublicKey, errorMsg = "Unsupported mint") {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    try {
      await createVestingPlan({
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
    } catch (error) {
      const errMsg = error.error?.errorMessage
        ? error.error?.errorMessage
        : anchor.AnchorError.parse(error.logs).error.errorMessage;
      assert.equal(errMsg, errorMsg);
    }
  }
});
