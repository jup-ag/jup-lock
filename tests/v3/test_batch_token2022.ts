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
  sleep,
} from "../common";
import {
  createLockerProgram,
  createVestingPlanV3,
  claimTokenV3,
} from "../locker_utils";
import { ADMIN, createMintTransaction } from "../locker_utils/token_2022/mint";
import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../common/merkleTree";

const provider = anchor.AnchorProvider.env();

describe("[V3] Batch create vesting with Token2022", () => {
  let TOKEN: web3.PublicKey;
  let UserKP: web3.Keypair;
  let RecipientKP: web3.Keypair[];
  let RecipientToken: web3.PublicKey[];
  let recipientPubkeys: web3.PublicKey[];

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
      RecipientKP = result.map((item: any) => item.keypair);
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
    RecipientToken = []
    for (const recipientor of RecipientKP) {
      const recipientorAta = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        UserKP,
        TOKEN,
        recipientor.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );
      RecipientToken.push(recipientorAta);
    }

    recipientPubkeys = RecipientKP.map((item: any) => item.publicKey);
    root = generateMerkleTreeRoot(recipientPubkeys);
    proof = getMerkleTreeProof(recipientPubkeys, RecipientKP[0].publicKey);
  });

  it("Batch Create Vesting plan", async () => {
    console.log("Batch create vesting plan");
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
      await claimTokenV3({
        recipient: RecipientKP[0],
        recipientToken: RecipientToken[0],
        escrow,
        maxAmount: new BN(1_000_000),
        isAssertion: true,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        proof,
      });
    } catch (error) {
      console.log(error);
    }
  });

  it("All recipients able to claim token2022", async () => {
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

    for (let i = 0; i < RecipientKP.length; i++) {
      const recipientor = RecipientKP[i];
      const recipientorAta = RecipientToken[i];
      const recipientorProof = getMerkleTreeProof(recipientPubkeys, recipientor.publicKey);
      try {
        await claimTokenV3({
          recipient: recipientor,
          recipientToken: recipientorAta,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: true,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          proof: recipientorProof,
        });
      } catch (error) {
        console.log(error);
      }
    }
  });
});
