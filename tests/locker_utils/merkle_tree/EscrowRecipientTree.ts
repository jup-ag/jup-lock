import { BN, web3 } from "@coral-xyz/anchor";
import { sha256 } from "js-sha256";
import { MerkleTree } from "./MerkleTree";

export type NodeType = {
  recipient: web3.PublicKey;
  vestingStartTime: BN;
  cliffTime: BN;
  frequency: BN;
  cliffUnlockAmount: BN;
  amountPerPeriod: BN;
  numberOfPeriod: BN;
  updateRecipientMode: number,
  cancelMode: number,
};
export class EscrowRecipientTree {
  private readonly _tree: MerkleTree;
  constructor(nodeData: NodeType[]) {
    this._validateNode(nodeData);
    this._tree = new MerkleTree(
      nodeData.map((node: NodeType) => {
        return EscrowRecipientTree.toNode(node);
      })
    );
  }

  private _validateNode(nodeData: NodeType[]) {
    nodeData.forEach((item: NodeType) => {
      if (item.vestingStartTime.gte(item.cliffTime)) {
        throw Error("cliff time must greater or equal vesting start time");
      }
      if (!item.frequency.gtn(0)) {
        throw Error("frequency must geater than zero");
      }
    });
  }
  static toNode(node: NodeType): Buffer {
    const {
      recipient,
      cliffUnlockAmount,
      amountPerPeriod,
      numberOfPeriod,
      cliffTime,
      frequency,
      vestingStartTime,
      updateRecipientMode,
      cancelMode,
    } = node;
    const buf = Buffer.concat([
      recipient.toBuffer(),
      new BN(vestingStartTime).toArrayLike(Buffer, "le", 8),
      new BN(cliffTime).toArrayLike(Buffer, "le", 8),
      new BN(frequency).toArrayLike(Buffer, "le", 8),
      new BN(cliffUnlockAmount).toArrayLike(Buffer, "le", 8),
      new BN(amountPerPeriod).toArrayLike(Buffer, "le", 8),
      new BN(numberOfPeriod).toArrayLike(Buffer, "le", 8),
      new BN(updateRecipientMode).toArrayLike(Buffer, "le", 1), // todo check this
      new BN(cancelMode).toArrayLike(Buffer, "le", 1),
    ]);

    const hashedBuff = Buffer.from(sha256(buf), "hex");
    const bufWithPrefix = Buffer.concat([Buffer.from([0]), hashedBuff]);

    return Buffer.from(sha256(bufWithPrefix), "hex");
  }

  getRoot(): Buffer {
    return this._tree.getRoot();
  }

  getProof(node: NodeType): Buffer[] {
    return this._tree.getProof(EscrowRecipientTree.toNode(node));
  }
}
