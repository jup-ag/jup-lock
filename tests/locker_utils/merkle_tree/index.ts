import { EscrowRecipientTree, NodeType } from "./EscrowRecipientTree";

export function generateMerkleTreeRoot(dataNode: NodeType[]): number[] {
  const escrowRecipientTree = new EscrowRecipientTree(dataNode);
  return Array.from(escrowRecipientTree.getRoot());
}

export function getMerkleTreeProof(dataNode: NodeType[], userNode: NodeType) {
  const escrowRecipientTree = new EscrowRecipientTree(dataNode);
  return escrowRecipientTree.getProof(userNode);
}
