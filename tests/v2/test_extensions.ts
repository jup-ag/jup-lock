import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime } from "../common";
import { createLockerProgram, createVestingPlanV2 } from "../locker_utils";
import { assert } from "chai";
import { ADMIN, createMintTransaction } from "../locker_utils/token_2022/mint";

const provider = anchor.AnchorProvider.env();

describe("[V2] Test supported/unsupported Token Mint", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair;

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

  it("InterestBearingConfig", async () => {
    // Define the extensions to be used by the mint
    let extensions = [ExtensionType.InterestBearingConfig];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("DefaultAccountState", async () => {
    // Define the extensions to be used by the mint
    let extensions = [ExtensionType.DefaultAccountState];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      true
    );

    await check(TOKEN, "Program log: Error: Account is frozen");
  });

  it("FreezeAuthority", async () => {
    let extensions = [];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      true
    );

    await check(TOKEN, "Program log: Error: Account is frozen");
  });

  it("ConfidentialTransferMint", async () => {
    let extensions = [ExtensionType.ConfidentialTransferMint];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      true
    );

    await check(TOKEN);
  });

  it("ConfidentialTransferFeeConfig", async () => {
    let extensions = [
      ExtensionType.TransferFeeConfig,
      ExtensionType.ConfidentialTransferMint,
    ];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      true
    );

    await check(TOKEN);
  });

  it("PermanentDelegate", async () => {
    let extensions = [ExtensionType.PermanentDelegate];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("MintCloseAuthority", async () => {
    let extensions = [ExtensionType.MintCloseAuthority];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("TransferHook", async () => {
    let extensions = [ExtensionType.TransferHook];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("GroupPointer", async () => {
    let extensions = [ExtensionType.GroupPointer];

    TOKEN = await createMintTransaction(provider, UserKP, extensions);

    await check(TOKEN);
  });

  it("GroupMemberPointer", async () => {
    let extensions = [ExtensionType.GroupMemberPointer];

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
      let escrow = await createVestingPlanV2({
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

      let RecipientToken = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        UserKP,
        TOKEN,
        RecipientKP.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );

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
        await claimTokenV2({
          recipient: RecipientKP,
          recipientToken: RecipientToken,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: true,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        });
      } catch (error) {
        console.log(error);
      }
    } catch (error) {
      if (error.logs.includes(errorMsg)) {
        assert(true);
      } else {
        const errMsg = error.error?.errorMessage
          ? error.error?.errorMessage
          : anchor.AnchorError.parse(error.logs)?.error.errorMessage;

        assert.equal(errMsg, errorMsg);
      }
    }
  }
});
