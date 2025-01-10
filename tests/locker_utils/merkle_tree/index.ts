import { web3, BN } from "@coral-xyz/anchor";
import { EscrowRecipientTree } from "./EscrowRecipientTree";

export function generateMerkleTreeRoot(
  data: {
    account: web3.PublicKey;
    cliffUnlockAmount: BN;
    amountPerPeriod: BN;
    numberOfPeriod: BN;
    cliffTime: BN;
    frequency: BN;
  }[]
): number[] {
  const escrowRecipientTree = new EscrowRecipientTree(data);
  return Array.from(escrowRecipientTree.getRoot());
}

export function getMerkleTreeProof(
  data: {
    account: web3.PublicKey;
    cliffUnlockAmount: BN;
    amountPerPeriod: BN;
    numberOfPeriod: BN;
    cliffTime: BN;
    frequency: BN;
  }[],
  user: {
    account: web3.PublicKey;
    cliffUnlockAmount: BN;
    amountPerPeriod: BN;
    numberOfPeriod: BN;
    cliffTime: BN;
    frequency: BN;
  }
) {
  const {
    account,
    cliffUnlockAmount,
    amountPerPeriod,
    numberOfPeriod,
    cliffTime,
    frequency,
  } = user;
  const escrowRecipientTree = new EscrowRecipientTree(data);
  return escrowRecipientTree.getProof(
    account,
    cliffUnlockAmount,
    amountPerPeriod,
    numberOfPeriod,
    cliffTime,
    frequency
  );
}
