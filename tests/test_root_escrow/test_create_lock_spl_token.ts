import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
  createAndFundWallet,
} from "../common";
import { createRootEscrow, fundRootEscrow, createVestingEscrowFromRoot } from "../locker_utils";
import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { EscrowRecipientTree } from "../locker_utils/merkle_tree/EscrowRecipientTree";

const provider = anchor.AnchorProvider.env();


interface VestingEcrow {
  recipient: PublicKey,
  vestingStartTime: anchor.BN;
  cliffTime: anchor.BN;
  frequency: anchor.BN;
  cliffUnlockAmount: anchor.BN;
  amountPerPeriod: anchor.BN;
  numberOfPeriod: anchor.BN;
  updateRecipientMode: number,
  cancelMode: number,
}

function getTotalDepsitAmount(escrow: VestingEcrow) {
  return escrow.cliffUnlockAmount.add(escrow.numberOfPeriod.mul(escrow.amountPerPeriod))
}

function getMaxClaimAmount(allEscrows: VestingEcrow[]) {
  let sum = new BN(0)
  for (let i = 0; i < allEscrows.length; i++) {
    sum = sum.add(getTotalDepsitAmount(allEscrows[i]))
  }
  return sum
}

describe("Root escrow Create vesting with spl token", () => {

  let payer: web3.Keypair = Keypair.generate();

  let allEscrows: VestingEcrow[] = [];
  let maxNumNodes = 5;
  let tree: EscrowRecipientTree;
  let mint: web3.PublicKey;

  before(async () => {
    {
      await createAndFundWallet(provider.connection, payer);
    }

    for (let i = 0; i < maxNumNodes; i++) {
      const result = await createAndFundWallet(provider.connection);
      allEscrows.push({
        recipient: result.keypair.publicKey,
        vestingStartTime: new BN(100),
        cliffTime: new BN(200),
        frequency: new BN(10),
        cliffUnlockAmount: new BN(100),
        amountPerPeriod: new BN(100),
        numberOfPeriod: new BN(200),
        updateRecipientMode: 0,
        cancelMode: 0
      });
    }

    tree = new EscrowRecipientTree(
      allEscrows
    );

    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
      web3.Keypair.generate(),
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID
    );
  });

  it("Full flow create Vesting plan", async () => {
    console.log("create root escrow")
    let rootEscrow = await createRootEscrow({
      isAssertion: true,
      tokenMint: mint,
      ownerKeypair: payer,
      maxClaimAmount: getMaxClaimAmount(allEscrows),
      maxEscrow: new BN(maxNumNodes),
      version: new BN(0),
      tokenProgram: TOKEN_PROGRAM_ID,
      root: tree.getRoot(),
    });

    console.log("fund root escrow")
    const payerToken = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey,
    )).address;
    await mintTo(provider.connection, payer, mint, payerToken, payer, getMaxClaimAmount(allEscrows).toNumber());
    await fundRootEscrow({
      isAssertion: true,
      rootEscrow,
      payerKP: payer
    })

    console.log("Create vesting escrow");
    for (let i = 0; i < maxNumNodes; i++) {
      var proofBuffers = tree.getProof(
        {
          vestingStartTime: allEscrows[i].vestingStartTime,
          cliffTime: allEscrows[i].cliffTime,
          frequency: allEscrows[i].frequency,
          cliffUnlockAmount: allEscrows[i].cliffUnlockAmount,
          amountPerPeriod: allEscrows[i].amountPerPeriod,
          numberOfPeriod: allEscrows[i].numberOfPeriod,
          updateRecipientMode: allEscrows[i].updateRecipientMode,
          cancelMode: allEscrows[i].cancelMode,
          recipient: allEscrows[i].recipient,
        }
      );
      let proof = [];
      proofBuffers.forEach(function (value) {
        proof.push(Array.from(new Uint8Array(value)));
      });

      await createVestingEscrowFromRoot({
        isAssertion: true,
        rootEscrow,
        vestingStartTime: allEscrows[i].vestingStartTime,
        cliffTime: allEscrows[i].cliffTime,
        frequency: allEscrows[i].frequency,
        cliffUnlockAmount: allEscrows[i].cliffUnlockAmount,
        amountPerPeriod: allEscrows[i].amountPerPeriod,
        numberOfPeriod: allEscrows[i].numberOfPeriod,
        updateRecipientMode: allEscrows[i].updateRecipientMode,
        cancelMode: allEscrows[i].cancelMode,
        recipient: allEscrows[i].recipient,
        payerKP: payer,
        proof
      });
    }
  });
});
