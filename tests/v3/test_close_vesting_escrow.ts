import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  createInitializeMint2Instruction,
  ExtensionType,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime, sleep } from "../common";
import { closeVestingEscrowV3, createEscrowMetadataV3 } from "../locker_utils";
import {
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createMintTransaction } from "../locker_utils/token_2022/mint";
import {
  generateMerkleTreeRoot,
  getMerkleTreeProof,
} from "../locker_utils/merkle_tree";
import { createAndFundBatchWallet } from "../common";
import { claimTokenV3, createVestingPlanV3 } from "../locker_utils";

let provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";

describe("[V3] Close vesting escrow", () => {
  // default value
  let vestingStartTime = new BN(0);
  let cliffTimeDurraion = 1;
  let frequency = new BN(1);
  let cliffUnlockAmount = new BN(100_000);
  let amountPerPeriod = new BN(50_000);
  let numberOfPeriod = new BN(1);
  let totalLockedAmount = cliffUnlockAmount.add(
    amountPerPeriod.mul(numberOfPeriod)
  );
  describe("Close vesting escrow with spl-token", () => {
    const tokenDecimal = 8;
    let mintAuthority: web3.Keypair;
    let mintKeypair: web3.Keypair;
    let TOKEN: web3.PublicKey;
    let mintAmount: bigint;

    let UserKP: web3.Keypair;
    let recipients: web3.Keypair[];
    let recipientAtas: web3.PublicKey[];
    let totalDepositAmount;
    let leaves: any;
    let cliffTime;
    let blockTime;

    let root: any;
    let proof: any;

    before(async () => {
      {
        await createAndFundWallet(provider.connection);
      }
      {
        const result = await createAndFundWallet(provider.connection);
        UserKP = result.keypair;
      }
      {
        const result = await createAndFundBatchWallet(provider.connection);
        recipients = result.map((item: any) => item.keypair);
      }

      mintAuthority = new web3.Keypair();
      mintKeypair = new web3.Keypair();
      TOKEN = mintKeypair.publicKey;

      mintAmount = BigInt(1_000_000 * Math.pow(10, tokenDecimal)); // Mint 1,000,000 tokens

      // Step 2 - Create a New Token
      const mintLamports =
        await provider.connection.getMinimumBalanceForRentExemption(82);
      const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: UserKP.publicKey,
          newAccountPubkey: TOKEN,
          space: 82,
          lamports: mintLamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(
          TOKEN, // Mint account
          tokenDecimal, // Decimals
          mintAuthority.publicKey, // Mint authority
          null, // Freeze authority
          TOKEN_PROGRAM_ID // Token program ID
        )
      );
      await sendAndConfirmTransaction(
        provider.connection,
        mintTransaction,
        [UserKP, mintKeypair],
        undefined
      );

      const userToken = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        UserKP,
        TOKEN,
        UserKP.publicKey,
        {},
        TOKEN_PROGRAM_ID
      );

      await mintTo(
        provider.connection,
        UserKP,
        TOKEN,
        userToken,
        mintAuthority,
        mintAmount,
        [],
        undefined,
        TOKEN_PROGRAM_ID
      );

      recipientAtas = [];
      for (const recipientor of recipients) {
        const recipientorAta = await createAssociatedTokenAccountIdempotent(
          provider.connection,
          UserKP,
          TOKEN,
          recipientor.publicKey,
          {},
          TOKEN_PROGRAM_ID
        );
        recipientAtas.push(recipientorAta);
      }
      blockTime = await getCurrentBlockTime(provider.connection);
      cliffTime = new BN(blockTime).add(new BN(cliffTimeDurraion));

      // create root & proof
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

    it("Close vesting escrow and escrow metadata", async () => {
      let escrow = await createVestingPlanV3({
        ownerKeypair: UserKP,
        tokenMint: TOKEN,
        isAssertion: true,
        tokenProgram: TOKEN_PROGRAM_ID,
        totalDepositAmount,
        cancelMode: 0,
        root,
      });

      console.log("Create escrow metadata");
      await createEscrowMetadataV3({
        escrow,
        name: "Jupiter lock",
        description: "This is jupiter lock",
        creatorEmail: "andrew@raccoons.dev",
        recipientEmail: "max@raccoons.dev",
        creator: UserKP,
        isAssertion: true,
      });

      // wait until vesting is over
      while (true) {
        const currentBlockTime = await getCurrentBlockTime(provider.connection);
        if (
          currentBlockTime >
          blockTime +
            cliffTimeDurraion +
            frequency.toNumber() * numberOfPeriod.toNumber()
        ) {
          break;
        } else {
          await sleep(1000);
          console.log("Wait until vesting over");
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
          frequency
        };
        const recipientProof = getMerkleTreeProof(leaves, recipientNode);

        const claimParams = {
          recipient: recipient,
          recipientToken: recipientAta,
          tokenMint: TOKEN,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: false,
          tokenProgram: TOKEN_PROGRAM_ID,
          proof: recipientProof,
          vestingStartTime,
          cliffTime,
          frequency,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
        };
        await claimTokenV3(claimParams);
      }

      console.log("Close vesting escrow");
      await closeVestingEscrowV3({
        escrow,
        creator: UserKP,
        isAssertion: true,
      });
    });

    it("Close vesting escrow without escrow metadata", async () => {
      let blockTime = await getCurrentBlockTime(provider.connection);
      let escrow = await createVestingPlanV3({
        ownerKeypair: UserKP,
        tokenMint: TOKEN,
        isAssertion: true,
        tokenProgram: TOKEN_PROGRAM_ID,
        totalDepositAmount,
        cancelMode: 0,
        root,
      });

      // wait until vesting is over
      while (true) {
        const currentBlockTime = await getCurrentBlockTime(provider.connection);
        if (
          currentBlockTime >
          blockTime +
            cliffTimeDurraion +
            frequency.toNumber() * numberOfPeriod.toNumber()
        ) {
          break;
        } else {
          await sleep(1000);
          console.log("Wait until vesting over");
        }
      }

      console.log("Claim token");
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const recipientAta = recipientAtas[i];
        const recipientNode = {
          account: recipient.publicKey,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
          cliffTime,
          frequency
        };
        const recipientProof = getMerkleTreeProof(leaves, recipientNode);

        const claimParams = {
          recipient: recipient,
          recipientToken: recipientAta,
          tokenMint: TOKEN,
          escrow,
          maxAmount: new BN(1_000_000),
          isAssertion: false,
          tokenProgram: TOKEN_PROGRAM_ID,
          proof: recipientProof,
          vestingStartTime,
          cliffTime,
          frequency,
          cliffUnlockAmount,
          amountPerPeriod,
          numberOfPeriod,
        };
        await claimTokenV3(claimParams);
      }

      console.log("Close vesting escrow");
      await closeVestingEscrowV3({
        escrow,
        creator: UserKP,
        isAssertion: true,
      });
    });
  });

  describe("Close vesting escrow with token2022", () => {
    let TOKEN: web3.PublicKey;
    let UserKP: web3.Keypair;
    let recipients: web3.Keypair[];
    let recipientAtas: web3.PublicKey[];
    let extensions: ExtensionType[];
    let totalDepositAmount;
    let blockTime;
    let cliffTime;

    let leaves: any;
    let root: any;
    let proof: any;
    before(async () => {
      {
        await createAndFundWallet(provider.connection);
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
      extensions = [
        ExtensionType.TransferFeeConfig,
        ExtensionType.TransferHook,
      ];

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

      blockTime = await getCurrentBlockTime(provider.connection);
      cliffTime = new BN(blockTime).add(new BN(cliffTimeDurraion));

      // create root & proof
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

    it("Close vesting escrow and escrow metadata", async () => {
      let blockTime = await getCurrentBlockTime(provider.connection);
      let escrow = await createVestingPlanV3({
        ownerKeypair: UserKP,
        tokenMint: TOKEN,
        isAssertion: true,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        totalDepositAmount,
        cancelMode: 0,
        root,
      });

      console.log("Create escrow metadata");
      await createEscrowMetadataV3({
        escrow,
        name: "Jupiter lock",
        description: "This is jupiter lock",
        creatorEmail: "andrew@raccoons.dev",
        recipientEmail: "max@raccoons.dev",
        creator: UserKP,
        isAssertion: true,
      });

      // wait until vesting is over
      while (true) {
        const currentBlockTime = await getCurrentBlockTime(provider.connection);
        if (
          currentBlockTime >
          blockTime +
            cliffTimeDurraion +
            frequency.toNumber() * numberOfPeriod.toNumber()
        ) {
          break;
        } else {
          await sleep(1000);
          console.log("Wait until vesting over");
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
          frequency
        };
        const recipientProof = getMerkleTreeProof(leaves, recipientNode);
        try {
          const claimParams = {
            recipient: recipient,
            recipientToken: recipientAta,
            tokenMint: TOKEN,
            escrow,
            maxAmount: new BN(1_000_000),
            isAssertion: false,
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

      console.log("Close vesting escrow");
      await closeVestingEscrowV3({
        escrow,
        creator: UserKP,
        isAssertion: true,
      });
    });

    it("Close vesting escrow without escrow metadata", async () => {
      let blockTime = await getCurrentBlockTime(provider.connection);
      let escrow = await createVestingPlanV3({
        ownerKeypair: UserKP,
        tokenMint: TOKEN,
        isAssertion: true,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        totalDepositAmount,
        cancelMode: 0,
        root,
      });
      // wait until vesting is over
      while (true) {
        const currentBlockTime = await getCurrentBlockTime(provider.connection);
        if (
          currentBlockTime >
          blockTime +
            cliffTimeDurraion +
            frequency.toNumber() * numberOfPeriod.toNumber()
        ) {
          break;
        } else {
          await sleep(1000);
          console.log("Wait until vesting over");
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
          frequency
        };
        const recipientProof = getMerkleTreeProof(leaves, recipientNode);
        try {
          const claimParams = {
            recipient: recipient,
            recipientToken: recipientAta,
            tokenMint: TOKEN,
            escrow,
            maxAmount: new BN(1_000_000),
            isAssertion: false,
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

      console.log("Close vesting escrow");
      await closeVestingEscrowV3({
        escrow,
        creator: UserKP,
        isAssertion: true,
      });
    });
  });
});
