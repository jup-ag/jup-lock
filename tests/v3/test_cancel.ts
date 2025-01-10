import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  ExtensionType,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundBatchWallet,
  createAndFundWallet,
  getCurrentBlockTime,
  invokeAndAssertError,
  sleep,
} from "../common";
import {
  createLockerProgram,
  createVestingPlanV3,
  cancelVestingPlanV3,
} from "../locker_utils";
import { ADMIN, createMintTransaction } from "../locker_utils/token_2022/mint";
import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../locker_utils/merkle_tree";

const provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";

describe("[V3] Cancel escrow", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let recipients: web3.Keypair[];
  let recipientAtas: web3.PublicKey[];
  let totalDepositAmount;
  let vestingStartTime;
  let cliffTime;
  let frequency;
  let cliffUnlockAmount;
  let amountPerPeriod;
  let numberOfPeriod;
  let totalLockedAmount;
  let leaves: any;
  let UserToken: web3.PublicKey;

  let extensions: ExtensionType[];
  let root: any;
  let proof: any;

  before(async () => {
    {
      await createAndFundWallet(provider.connection, ADMIN);
    }
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundBatchWallet(provider.connection);
      recipients = result.map((item: any) => item.keypair);
    }

    // Define the extensions to be used by the mint
    extensions = [ExtensionType.TransferFeeConfig, ExtensionType.TransferHook];

    TOKEN = await createMintTransaction(
      provider,
      UserKP,
      extensions,
      true,
      false
    );
    UserToken = await getAssociatedTokenAddress(
      TOKEN,
      UserKP.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    recipientAtas = [];
    for (const recipientor of recipients) {
      const recipientorAta = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        UserKP,
        TOKEN,
        recipientor.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );
      recipientAtas.push(recipientorAta);
    }

    // create root & proof
    // default value
    vestingStartTime = new BN(0);
    let currentBlockTime = await getCurrentBlockTime(provider.connection);
    cliffTime = new BN(currentBlockTime).add(new BN(5));
    frequency = new BN(2);
    cliffUnlockAmount = new BN(100_000);
    amountPerPeriod = new BN(50_000);
    numberOfPeriod = new BN(2);
    totalLockedAmount = cliffUnlockAmount.add(
      amountPerPeriod.mul(numberOfPeriod)
    );
    leaves = recipients.map((item) => {
      return {
        account: item.publicKey,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        cliffTime,
        frequency
      };
    });
    const user = {
      account: recipients[0].publicKey,
      cliffUnlockAmount,
      amountPerPeriod,
      numberOfPeriod,
      cliffTime,
      frequency
    };
    totalDepositAmount = totalLockedAmount.muln(leaves.length);
    root = generateMerkleTreeRoot(leaves);
    proof = getMerkleTreeProof(leaves, user);
  });

  it("No one is able to cancel", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 0,
      root,
    });

    console.log("Cancel vesting plan");
    invokeAndAssertError(
      async () => {
        await cancelVestingPlanV3(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            signer: UserKP,
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );

    invokeAndAssertError(
      async () => {
        await cancelVestingPlanV3(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            signer: recipients[0],
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );
  });

  it("Creator is able to cancel", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 1,
      root,
    });

    console.log("Cancel Vesting Plan");
    invokeAndAssertError(
      async () => {
        await cancelVestingPlanV3(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            signer: recipients[0],
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );

    await cancelVestingPlanV3(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        signer: UserKP,
      },
      0,
      200_000
    );
  });

  it("Recipient is not able to cancel", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 2,
      root,
    });

    console.log("Cancel Vesting Plan");
    invokeAndAssertError(
      async () => {
        await cancelVestingPlanV3(
          {
            escrow,
            isAssertion: true,
            rentReceiver: UserKP.publicKey,
            creatorToken: UserToken,
            signer: recipients[0],
          },
          0,
          200_000
        );
      },
      "Not permit to do this action",
      true
    );
  });

  it("Creator is able to cancel after cliff time", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 1,
      root,
    });

    while (true) {
      const currentBlockTime = await getCurrentBlockTime(provider.connection);
      if (currentBlockTime > cliffTime.toNumber()) {
        break;
      } else {
        await sleep(1000);
        console.log("Wait until startTime");
      }
    }

    console.log("Cancel Vesting Plan");
    await cancelVestingPlanV3(
      {
        escrow,
        isAssertion: true,
        rentReceiver: UserKP.publicKey,
        creatorToken: UserToken,
        signer: UserKP,
      },
      0,
      200_000
    );
  });
});
