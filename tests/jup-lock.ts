import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { JupLock } from "../target/types/locker";

describe("locker", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.JupLock as Program<JupLock>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
