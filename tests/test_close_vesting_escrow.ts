import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
    createAssociatedTokenAccountIdempotent,
    createInitializeMint2Instruction,
    ExtensionType,
    mintTo,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { createAndFundWallet, getCurrentBlockTime, sleep } from "./common";
import {
    claimToken,
    claimTokenV2,
    closeVestingEscrow,
    createEscrowMetadata,
    createLockerProgram,
    createVestingPlan,
    createVestingPlanV2,
} from "./locker_utils";
import {
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";
import { createMintTransaction } from "./locker_utils/token_2022/mint";

let provider = anchor.AnchorProvider.env();
provider.opts.commitment = "confirmed";

describe("Close vesting escrow", () => {
    let cliffTimeDuration = 1;
    let frequency = 1;
    let numberOfPeriod = 1;
    describe("Close vesting escrow with spl-token", () => {
        const tokenDecimal = 8;
        let mintAuthority: web3.Keypair;
        let mintKeypair: web3.Keypair;
        let TOKEN: web3.PublicKey;
        let UserKP: web3.Keypair;
        let RecipientKP: web3.Keypair;
        let recipientToken: web3.PublicKey;
        let mintAmount: bigint;
        before(async () => {
            {
                const result = await createAndFundWallet(provider.connection);
                UserKP = result.keypair;
            }
            {
                const result = await createAndFundWallet(provider.connection);
                RecipientKP = result.keypair;
            }

            mintAuthority = new web3.Keypair();
            mintKeypair = new web3.Keypair();
            TOKEN = mintKeypair.publicKey;

            mintAmount = BigInt(1_000_000 * Math.pow(10, tokenDecimal)); // Mint 1,000,000 tokens

            // Step 2 - Create a New Token
            const mintLamports =
                await provider.connection.getMinimumBalanceForRentExemption(82);
            const mintTransaction = new Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: UserKP.publicKey,
                    newAccountPubkey: TOKEN,
                    space: 82,
                    lamports: mintLamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMint2Instruction(
                    TOKEN, // Mint account
                    tokenDecimal, // Decimals
                    mintAuthority.publicKey, // Mint authority
                    null, // Freeze authority
                    TOKEN_PROGRAM_ID // Token program ID
                )
            );
            await sendAndConfirmTransaction(
                provider.connection,
                mintTransaction,
                [UserKP, mintKeypair],
                undefined
            );

            const userToken = await createAssociatedTokenAccountIdempotent(
                provider.connection,
                UserKP,
                TOKEN,
                UserKP.publicKey,
                {},
                TOKEN_PROGRAM_ID
            );

            recipientToken = await createAssociatedTokenAccountIdempotent(
                provider.connection,
                RecipientKP,
                TOKEN,
                RecipientKP.publicKey,
                {},
                TOKEN_PROGRAM_ID
            );

            await mintTo(
                provider.connection,
                UserKP,
                TOKEN,
                userToken,
                mintAuthority,
                mintAmount,
                [],
                undefined,
                TOKEN_PROGRAM_ID
            );
        });
        it("Close vesting escrow and escrow metadata", async () => {
            console.log("Create vesting plan");
            const program = createLockerProgram(new anchor.Wallet(UserKP));
            let blockTime = await getCurrentBlockTime(
                program.provider.connection
            );
            const cliffTime = new BN(blockTime).add(new BN(cliffTimeDuration));
            let escrow = await createVestingPlan({
                ownerKeypair: UserKP,
                tokenMint: TOKEN,
                vestingStartTime: new BN(0),
                isAssertion: true,
                cliffTime,
                frequency: new BN(frequency),
                cliffUnlockAmount: new BN(100_000),
                amountPerPeriod: new BN(50_000),
                numberOfPeriod: new BN(numberOfPeriod),
                recipient: RecipientKP.publicKey,
                updateRecipientMode: 0,
                cancelMode: 0,
            });

            console.log("Create escrow metadata");
            await createEscrowMetadata({
                escrow,
                name: "Jupiter lock",
                description: "This is jupiter lock",
                creatorEmail: "andrew@raccoons.dev",
                recipientEndpoint: "max@raccoons.dev",
                creator: UserKP,
                isAssertion: true,
            });

            // wait until vesting is over
            while (true) {
                const currentBlockTime = await getCurrentBlockTime(
                    program.provider.connection
                );
                if (currentBlockTime > blockTime + cliffTimeDuration + frequency * numberOfPeriod) {
                    break;
                } else {
                    await sleep(1000);
                    console.log("Wait until vesting over");
                }
            }

            console.log("Claim token");
            await claimToken({
                recipient: RecipientKP,
                recipientToken,
                escrow,
                maxAmount: new BN(1_000_000_000_000),
                isAssertion: false,
            });

            console.log("Close vesting escrow");
            await closeVestingEscrow({
                escrow, creator: UserKP,
                isAssertion: true,
            })
        });


        it("Close vesting escrow without escrow metadata", async () => {
            console.log("Create vesting plan");
            const program = createLockerProgram(new anchor.Wallet(UserKP));
            let blockTime = await getCurrentBlockTime(
                program.provider.connection
            );
            const cliffTime = new BN(blockTime).add(new BN(cliffTimeDuration));
            let escrow = await createVestingPlan({
                ownerKeypair: UserKP,
                tokenMint: TOKEN,
                vestingStartTime: new BN(0),
                isAssertion: true,
                cliffTime,
                frequency: new BN(frequency),
                cliffUnlockAmount: new BN(100_000),
                amountPerPeriod: new BN(50_000),
                numberOfPeriod: new BN(numberOfPeriod),
                recipient: RecipientKP.publicKey,
                updateRecipientMode: 0,
                cancelMode: 0,
            });

            // wait until vesting is over
            while (true) {
                const currentBlockTime = await getCurrentBlockTime(
                    program.provider.connection
                );
                if (currentBlockTime > blockTime + cliffTimeDuration + frequency * numberOfPeriod) {
                    break;
                } else {
                    await sleep(1000);
                    console.log("Wait until vesting over");
                }
            }

            console.log("Claim token");
            await claimToken({
                recipient: RecipientKP,
                recipientToken,
                escrow,
                maxAmount: new BN(1_000_000_000_000),
                isAssertion: false,
            });

            console.log("Close vesting escrow");
            await closeVestingEscrow({
                escrow, creator: UserKP,
                isAssertion: true,
            })
        });
    });


    describe("Close vesting escrow with token2022", () => {
        let TOKEN: web3.PublicKey;
        let UserKP: web3.Keypair;
        let RecipientKP: web3.Keypair;
        let recipientToken: web3.PublicKey;
        before(async () => {
            {
                const result = await createAndFundWallet(provider.connection);
                UserKP = result.keypair;
            }
            {
                const result = await createAndFundWallet(provider.connection);
                RecipientKP = result.keypair;
            }

            // Define the extensions to be used by the mint
            let extensions = [ExtensionType.TransferHook, ExtensionType.TransferFeeConfig];

            console.log("create mint")
            TOKEN = await createMintTransaction(
                provider,
                UserKP,
                extensions,
                true,
                false
            );
            console.log("create recipientToken")
            recipientToken = await createAssociatedTokenAccountIdempotent(
                provider.connection,
                RecipientKP,
                TOKEN,
                RecipientKP.publicKey,
                {},
                TOKEN_2022_PROGRAM_ID
            );
        });
        it("Close vesting escrow and escrow metadata", async () => {
            console.log("Create vesting plan");
            const program = createLockerProgram(new anchor.Wallet(UserKP));
            let blockTime = await getCurrentBlockTime(
                program.provider.connection
            );
            const cliffTime = new BN(blockTime).add(new BN(cliffTimeDuration));
            let escrow = await createVestingPlanV2({
                ownerKeypair: UserKP,
                tokenMint: TOKEN,
                vestingStartTime: new BN(0),
                isAssertion: true,
                cliffTime,
                frequency: new BN(frequency),
                cliffUnlockAmount: new BN(100_000),
                amountPerPeriod: new BN(50_000),
                numberOfPeriod: new BN(numberOfPeriod),
                recipient: RecipientKP.publicKey,
                updateRecipientMode: 0,
                cancelMode: 0,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            });

            console.log("Create escrow metadata");
            await createEscrowMetadata({
                escrow,
                name: "Jupiter lock",
                description: "This is jupiter lock",
                creatorEmail: "andrew@raccoons.dev",
                recipientEndpoint: "max@raccoons.dev",
                creator: UserKP,
                isAssertion: true,
            });

            // wait until vesting is over
            while (true) {
                const currentBlockTime = await getCurrentBlockTime(
                    program.provider.connection
                );
                if (currentBlockTime > blockTime + cliffTimeDuration + frequency * numberOfPeriod) {
                    break;
                } else {
                    await sleep(1000);
                    console.log("Wait until vesting over");
                }
            }

            console.log("Claim token");
            await claimTokenV2({
                recipient: RecipientKP,
                recipientToken,
                escrow,
                maxAmount: new BN(1_000_000_000_000),
                isAssertion: false,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            });

            console.log("Close vesting escrow");
            await closeVestingEscrow({
                escrow, creator: UserKP,
                isAssertion: true,
            })
        });


        it("Close vesting escrow without escrow metadata", async () => {
            console.log("Create vesting plan");
            const program = createLockerProgram(new anchor.Wallet(UserKP));
            let blockTime = await getCurrentBlockTime(
                program.provider.connection
            );
            const cliffTime = new BN(blockTime).add(new BN(cliffTimeDuration));
            let escrow = await createVestingPlanV2({
                ownerKeypair: UserKP,
                tokenMint: TOKEN,
                vestingStartTime: new BN(0),
                isAssertion: true,
                cliffTime,
                frequency: new BN(frequency),
                cliffUnlockAmount: new BN(100_000),
                amountPerPeriod: new BN(50_000),
                numberOfPeriod: new BN(numberOfPeriod),
                recipient: RecipientKP.publicKey,
                updateRecipientMode: 0,
                cancelMode: 0,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            });

            // wait until vesting is over
            while (true) {
                const currentBlockTime = await getCurrentBlockTime(
                    program.provider.connection
                );
                if (currentBlockTime > blockTime + cliffTimeDuration + frequency * numberOfPeriod) {
                    break;
                } else {
                    await sleep(1000);
                    console.log("Wait until vesting over");
                }
            }

            console.log("Claim token");
            await claimTokenV2({
                recipient: RecipientKP,
                recipientToken,
                escrow,
                maxAmount: new BN(1_000_000_000_000),
                isAssertion: false,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            });

            console.log("Close vesting escrow");
            await closeVestingEscrow({
                escrow, creator: UserKP,
                isAssertion: true,
            })
        });
    });

})