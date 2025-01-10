import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  ExtensionType,
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
  claimTokenV3,
  createLockerProgram,
  createVestingPlanV3,
} from "../locker_utils";
import { ADMIN, createMintTransaction } from "../locker_utils/token_2022/mint";
import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../locker_utils/merkle_tree";

const provider = anchor.AnchorProvider.env();

describe("[V3] Create vesting with Token2022", () => {
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
        frequency,
        vestingStartTime
      };
    });
    const user = {
      account: recipients[0].publicKey,
      cliffUnlockAmount,
      amountPerPeriod,
      numberOfPeriod,
      cliffTime,
      frequency,
      vestingStartTime
    };
    totalDepositAmount = totalLockedAmount.muln(leaves.length);
    root = generateMerkleTreeRoot(leaves);
    proof = getMerkleTreeProof(leaves, user);
  });

  it("Full flow Create Vesting plan", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 0,
      root,
    });

    try {
      const claimParams = {
        recipient: recipients[0],
        recipientToken: recipientAtas[0],
        tokenMint: TOKEN,
        escrow,
        maxAmount: new BN(100_000),
        isAssertion: true,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        proof,
        vestingStartTime,
        cliffTime,
        frequency,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
      };
      await claimTokenV3(claimParams);
    } catch (error) {
      console.log(error);
    }
  });

  it("All recipients able to claim spl token", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 0,
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

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const recipientAta = recipientAtas[i];
      const recipientNode = {
        account: recipient.publicKey,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod,
        cliffTime,
        frequency,
        vestingStartTime
      };
      const recipientProof = getMerkleTreeProof(leaves, recipientNode);
      try {
        const claimParams = {
          recipient: recipient,
          recipientToken: recipientAta,
          tokenMint: TOKEN,
          escrow,
          maxAmount: new BN(100_000),
          isAssertion: true,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          proof: recipientProof,
          vestingStartTime,
          cliffTime,
          frequency,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
        };
        await claimTokenV3(claimParams);
      } catch (error) {
        console.log(error);
      }
    }
  });

  it("Fake recipient can not claim", async () => {
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      tokenMint: TOKEN,
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      totalDepositAmount,
      cancelMode: 0,
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

    const newRecipient = web3.Keypair.generate();
    const newRecipientAta = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      newRecipient.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
    );
    const recipientNode = {
      account: newRecipient.publicKey,
      cliffUnlockAmount,
      amountPerPeriod,
      numberOfPeriod,
      cliffTime,
      frequency,
      vestingStartTime
    };
    const newRecipientProof = getMerkleTreeProof(leaves, recipientNode);

    invokeAndAssertError(
      async () => {
        const claimParams = {
          recipient: newRecipient,
          recipientToken: newRecipientAta,
          tokenMint: TOKEN,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: false,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          proof: newRecipientProof,
          vestingStartTime,
          cliffTime,
          frequency,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
        };
        await claimTokenV3(claimParams);
      },
      "Invalid merkle proof",
      true
    );
  });
});
