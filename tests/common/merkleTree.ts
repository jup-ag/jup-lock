import { web3 } from "@coral-xyz/anchor";
import { MerkleTree } from "merkletreejs";
import { sha256 } from "js-sha256";

export function generateMerkleTreeRoot(users: web3.PublicKey[]): number[] {
  const leaves = users.map((user: web3.PublicKey) =>
    sha256(user.toBuffer())
  );
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true });
  return Array.from(tree.getRoot());
}

export function getMerkleTreeProof(
  users: web3.PublicKey[],
  user: web3.PublicKey
) {
  const leaves = users.map((user: web3.PublicKey) =>
    sha256(user.toBuffer())
  );
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true });
  let leaf = sha256(user.toBuffer());
  return tree.getProof(leaf).map((item: any) => Array.from(item.data));
}
