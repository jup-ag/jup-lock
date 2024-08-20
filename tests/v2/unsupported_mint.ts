import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import { ExtensionType, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime } from "../common";
import { createLockerProgram, createVestingPlan } from "./locker_utils";
import { assert } from "chai";
import { createMintTransaction } from "./locker_utils/mint";

const provider = anchor.AnchorProvider.env();

describe("[V2] Test supported/unsupported Token Mint", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair;

  let extensions: ExtensionType[];

  before(async () => {
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

  it("[FAIL] unsupported FreezeAuthority without TokenBadge", async () => {
    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      false,
      true
    );

    await check(TOKEN);
  });

  it("supported FreezeAuthority with TokenBadge", async () => {
    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      false,
      true,
      true
    );

    await check(TOKEN);
  });

  it("[FAIL] unsupported PermanentDelegate without TokenBadge", async () => {
    extensions = [ExtensionType.PermanentDelegate];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("supported PermanentDelegate with TokenBadge", async () => {
    extensions = [ExtensionType.PermanentDelegate];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      false,
      true
    );

    await check(TOKEN);
  });

  it("[FAIL] unsupported MintCloseAuthority without TokenBadge", async () => {
    extensions = [ExtensionType.MintCloseAuthority];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("supported MintCloseAuthority with TokenBadge", async () => {
    extensions = [ExtensionType.MintCloseAuthority];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      false,
      true
    );

    await check(TOKEN);
  });

  async function check(TOKEN: web3.PublicKey) {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );

    const startTime = new BN(currentBlockTime).add(new BN(5));
    try {
      await createVestingPlan({
        ownerKeypair: UserKP,
        tokenMint: TOKEN,
        isAssertion: true,
        startTime,
        frequency: new BN(1),
        initialUnlockAmount: new BN(100_000),
        amountPerPeriod: new BN(50_000),
        numberOfPeriod: new BN(2),
        recipient: RecipientKP.publicKey,
        updateRecipientMode: 0,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      });
    } catch (error) {
      const errMsg = error.error?.errorMessage
        ? error.error?.errorMessage
        : anchor.AnchorError.parse(error.logs).error.errorMessage;
      assert.equal(errMsg, "Unsupported mint");
    }
  }
});
