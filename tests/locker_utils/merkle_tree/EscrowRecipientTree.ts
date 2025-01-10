import { BN, web3 } from "@coral-xyz/anchor";
import { sha256 } from "js-sha256";
import { MerkleTree } from "./MerkleTree";

export class EscrowRecipientTree {
  private readonly _tree: MerkleTree;
  constructor(
    balances: {
      account: web3.PublicKey;
      cliffUnlockAmount: BN;
      amountPerPeriod: BN;
      numberOfPeriod: BN;
    }[]
  ) {
    this._tree = new MerkleTree(
      balances.map(
        (
          {
            account,
            cliffUnlockAmount,
            amountPerPeriod,
            numberOfPeriod,
          },
          index
        ) => {
          return EscrowRecipientTree.toNode(
            account,
            cliffUnlockAmount,
            amountPerPeriod,
            numberOfPeriod
          );
        }
      )
    );
  }

  // sha256(abi.encode(index, account, amount))
  static toNode(
    account: web3.PublicKey,
    cliffUnlockAmount: BN,
    amountPerPeriod: BN,
    numberOfPeriod: BN,
  ): Buffer {
    const buf = Buffer.concat([
      account.toBuffer(),
      new BN(cliffUnlockAmount).toArrayLike(Buffer, "le", 8),
      new BN(amountPerPeriod).toArrayLike(Buffer, "le", 8),
      new BN(numberOfPeriod).toArrayLike(Buffer, "le", 8),
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
    cliffUnlockAmount: BN,
    amountPerPeriod: BN,
    numberOfPeriod: BN,
  ): Buffer[] {
    return this._tree.getProof(
      EscrowRecipientTree.toNode(
        account,
        cliffUnlockAmount,
        amountPerPeriod,
        numberOfPeriod
      )
    );
  }
}
