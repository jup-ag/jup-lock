import { AnchorError } from "@coral-xyz/anchor";
import { expect } from "chai";

export async function invokeAndAssertError(
  cb: () => Promise<void>,
  message: string,
  isAnchorError: boolean
) {
  let error = null;

  try {
    await cb();
  } catch (err) {
    error = err;
    if (isAnchorError) {
      // if (!(error instanceof AnchorError)) {
      //   console.log(error);
      // }
      expect(error instanceof AnchorError).to.be.true;

      const anchorError: AnchorError = error;
      // if (
      //   anchorError.error.errorMessage.toLowerCase() != message.toLowerCase()
      // ) {
      //   console.log(anchorError.error.errorMessage.toLowerCase());
      // }
      expect(anchorError.error.errorMessage.toLowerCase()).to.be.equal(
        message.toLowerCase()
      );
    } else {
      const logs: string[] = error.logs;
      expect(logs.find((s) => s.toLowerCase().includes(message.toLowerCase())))
        .to.be.not.undefined;
    }
  }

  expect(error).not.null;
}