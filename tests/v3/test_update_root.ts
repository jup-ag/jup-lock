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
} from "../common";
import {
  claimTokenV3,
  createLockerProgram,
  createVestingPlanV3,
  updateRootData,
} from "../locker_utils";

import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../common/merkleTree";
import { createMintTransaction } from "../locker_utils/token_2022/mint";

const provider = anchor.AnchorProvider.env();

describe("[V3] Update root data", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair[];
  let RecipientToken: web3.PublicKey;
  let recipientPubkeys: web3.PublicKey[];

  let extensions: ExtensionType[];
  let root: any;
  let proof: any;
  let newRoot: any;
  before(async () => {
    {
      const result = await createAndFundWallet(provider.connection);
      UserKP = result.keypair;
    }
    {
      const result = await createAndFundBatchWallet(provider.connection);
      RecipientKP = result.map((item: any) => item.keypair);
    }

    extensions = [ExtensionType.TransferFeeConfig, ExtensionType.TransferHook];

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
      RecipientKP[0].publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
    );

    recipientPubkeys = RecipientKP.map((item: any) => item.publicKey);
    root = generateMerkleTreeRoot(recipientPubkeys);
    proof = getMerkleTreeProof(recipientPubkeys, RecipientKP[0].publicKey);
    recipientPubkeys.push(web3.Keypair.generate().publicKey);
    newRoot = generateMerkleTreeRoot(recipientPubkeys);
  });

  it("No one is able to update", async () => {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 0,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      root,
    });

    invokeAndAssertError(
      async () => {
        await updateRootData({
          escrow,
          isAssertion: false,
          signer: UserKP,
          newRoot,
        });
      },
      "Not permit to do this action",
      true
    );

    invokeAndAssertError(
      async () => {
        await updateRootData({
          escrow,
          isAssertion: false,
          signer: RecipientKP[0],
          newRoot,
        });
      },
      "Not permit to do this action",
      true
    );
  });

  it("Only creator is able to update root data", async () => {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 1,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      root,
    });

    invokeAndAssertError(
      async () => {
        await updateRootData({
          escrow,
          isAssertion: false,
          signer: RecipientKP[0],
          newRoot,
        });
      },
      "Not permit to do this action",
      true
    );

    await updateRootData({
      escrow,
      isAssertion: true,
      signer: UserKP,
      newRoot,
    });
  });

  it("Can not able to update duplicated root data", async () => {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 1,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      root,
    });

    invokeAndAssertError(
      async () => {
        await updateRootData({
          escrow,
          isAssertion: true,
          signer: UserKP,
          newRoot: root,
        });
      },
      "Root data is duplicated",
      true
    );
  });

  it("Recipient is not able to update root data", async () => {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 2,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      root,
    });

    invokeAndAssertError(
      async () => {
        await updateRootData({
          escrow,
          isAssertion: true,
          signer: RecipientKP[0],
          newRoot,
        });
      },
      "Not permit to do this action",
      true
    );
  });

  it("creator add new recipient", async () => {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 1,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      root,
    });
    const newRecipient = web3.Keypair.generate();
    recipientPubkeys.push(newRecipient.publicKey);
    const newRecipientorAta = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      newRecipient.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
    );
    const addNewRecipientRoot = generateMerkleTreeRoot(recipientPubkeys);
    const newProof = getMerkleTreeProof(
      recipientPubkeys,
      newRecipient.publicKey
    );

    await updateRootData({
      escrow,
      isAssertion: true,
      signer: UserKP,
      newRoot: addNewRecipientRoot,
    });

    await claimTokenV3({
      recipient: newRecipient,
      recipientToken: newRecipientorAta,
      escrow,
      maxAmount: new BN(1_000_000),
      isAssertion: true,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      proof: newProof,
      capLen: new BN(recipientPubkeys.length),
    });
  });

  it("creator remove an recipient", async () => {
    const program = createLockerProgram(new anchor.Wallet(UserKP));
    let currentBlockTime = await getCurrentBlockTime(
      program.provider.connection
    );
    const cliffTime = new BN(currentBlockTime).add(new BN(5));
    let escrow = await createVestingPlanV3({
      ownerKeypair: UserKP,
      vestingStartTime: new BN(0),
      tokenMint: TOKEN,
      isAssertion: true,
      cliffTime,
      frequency: new BN(1),
      cliffUnlockAmount: new BN(100_000),
      amountPerPeriod: new BN(50_000),
      numberOfPeriod: new BN(2),
      updateRecipientMode: 1,
      cancelMode: 0,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      root,
    });
    const removedRecipient = RecipientKP[RecipientKP.length - 1];
    RecipientKP.pop();
    const removedRecipientorAta = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      UserKP,
      TOKEN,
      removedRecipient.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID
    );
    recipientPubkeys.pop();
    const addNewRecipientRoot = generateMerkleTreeRoot(recipientPubkeys);
    const removedRecipientProof = getMerkleTreeProof(
      recipientPubkeys,
      removedRecipient.publicKey
    );

    await updateRootData({
      escrow,
      isAssertion: true,
      signer: UserKP,
      newRoot: addNewRecipientRoot,
    });

    invokeAndAssertError(
      async () => {
        await claimTokenV3({
          recipient: removedRecipient,
          recipientToken: removedRecipientorAta,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: true,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          proof: removedRecipientProof,
          capLen: new BN(recipientPubkeys.length),
        });
      },
      "Not permit to do this action",
      true
    );
  });
});
