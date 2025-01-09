import { web3, BN } from "@coral-xyz/anchor";
import { BalanceTree } from "./merkle_tree";

export function generateMerkleTreeRoot(users: web3.PublicKey[]): number[] {
  const balances: { account: web3.PublicKey; maxCap: BN }[] = users.map(
    (item) => {
      return { account: item, maxCap: new BN(users.length) };
    }
  );
  const balanceTree = new BalanceTree(balances);
  return Array.from(balanceTree.getRoot());
}

export function getMerkleTreeProof(
  users: web3.PublicKey[],
  user: web3.PublicKey
) {
  const balances: { account: web3.PublicKey; maxCap: BN }[] = users.map(
    (item) => {
      return { account: item, maxCap: new BN(users.length) };
    }
  );
  const balanceTree = new BalanceTree(balances);
  return balanceTree.getProof(user, new BN(users.length));
}
