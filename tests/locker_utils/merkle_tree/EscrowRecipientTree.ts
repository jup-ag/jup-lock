import { BN, web3 } from "@coral-xyz/anchor";
import { sha256 } from "js-sha256";
import { MerkleTree } from "./merkleTree";

export class EscrowRecipientTree {
  private readonly _tree: MerkleTree;
  constructor(
    balances: {
      account: web3.PublicKey;
      totalLockedAmount: BN;
      vestingStartTime: BN;
      cliffTime: BN;
      frequency: BN;
    }[]
  ) {
    this._tree = new MerkleTree(
      balances.map(
        (
          {
            account,
            totalLockedAmount,
            vestingStartTime,
            cliffTime,
            frequency,
          },
          index
        ) => {
          return EscrowRecipientTree.toNode(
            account,
            totalLockedAmount,
            vestingStartTime,
            cliffTime,
            frequency
          );
        }
      )
    );
  }

  // sha256(abi.encode(index, account, amount))
  static toNode(
    account: web3.PublicKey,
    totalLockedAmount: BN,
    vestingStartTime: BN,
    cliffTime: BN,
    frequency: BN
  ): Buffer {
    const buf = Buffer.concat([
      account.toBuffer(),
      new BN(totalLockedAmount).toArrayLike(Buffer, "le", 8),
      new BN(vestingStartTime).toArrayLike(Buffer, "le", 8),
      new BN(cliffTime).toArrayLike(Buffer, "le", 8),
      new BN(frequency).toArrayLike(Buffer, "le", 8),
    ]);

    const hashedBuff = Buffer.from(sha256(buf), "hex");
    const bufWithPrefix = Buffer.concat([Buffer.from([0]), hashedBuff]);

    return Buffer.from(sha256(bufWithPrefix), "hex");
  }

  getRoot(): Buffer {
    return this._tree.getRoot();
  }

  getProof(
    account: web3.PublicKey,
    totalLockedAmount: BN,
    vestingStartTime: BN,
    cliffTime: BN,
    frequency: BN
  ): Buffer[] {
    return this._tree.getProof(
      EscrowRecipientTree.toNode(
        account,
        totalLockedAmount,
        vestingStartTime,
        cliffTime,
        frequency
      )
    );
  }
}
