import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";
import {
    createAndFundWallet,
    getCurrentBlockTime,
    invokeAndAssertError,
    sleep,
} from "./common";
import { claimToken, createEscrowMetadata, createLockerProgram, createVestingPlan, updateRecipient } from "./locker_utils";


const provider = anchor.AnchorProvider.env();
provider.opts.commitment = 'confirmed';

describe("Update recipient", () => {
    const tokenDecimal = 8;
    let TOKEN: web3.PublicKey;
    let UserKP: web3.Keypair;
    let ReceipentKP: web3.Keypair;

    before(async () => {
        {
            const result = await createAndFundWallet(provider.connection);
            UserKP = result.keypair;
        }
        {
            const result = await createAndFundWallet(provider.connection);
            ReceipentKP = result.keypair;
        }

        TOKEN = await createMint(
            provider.connection,
            UserKP,
            UserKP.publicKey,
            null,
            tokenDecimal,
            web3.Keypair.generate(),
            {
                commitment: "confirmed",
            },
            TOKEN_PROGRAM_ID
        );

        const userToken = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            UserKP,
            TOKEN,
            UserKP.publicKey,
            false,
            "confirmed",
            {
                commitment: "confirmed",
            },
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        // userBTC = userTokenX.address;
        await mintTo(
            provider.connection,
            UserKP,
            TOKEN,
            userToken.address,
            UserKP.publicKey,
            100 * 10 ** tokenDecimal,
            [],
            {
                commitment: "confirmed",
            },
            TOKEN_PROGRAM_ID
        );
    });
    it("No one is able to update", async () => {
        console.log("Create vesting plan");
        const program = createLockerProgram(new anchor.Wallet(UserKP));
        let currentBlockTime = await getCurrentBlockTime(program.provider.connection);
        const cliffTime = new BN(currentBlockTime).add(new BN(5));
        let escrow = await createVestingPlan({
            ownerKeypair: UserKP,
            vestingStartTime: new BN(0),
            tokenMint: TOKEN,
            isAssertion: true,
            cliffTime,
            frequency: new BN(1),
            cliffUnlockAmount: new BN(100_000),
            amountPerPeriod: new BN(50_000),
            numberOfPeriod: new BN(2),
            recipient: ReceipentKP.publicKey,
            updateRecipientMode: 0,
        });
        console.log("Update recipient");
        const newRecipient = web3.Keypair.generate();
        invokeAndAssertError(async () => {
            await updateRecipient({
                escrow,
                newRecipient: newRecipient.publicKey,
                isAssertion: true,
                signer: UserKP,
                newRecipientEmail: null,
            });
        }, "Not permit to do this action", true);

        invokeAndAssertError(async () => {
            await updateRecipient({
                escrow,
                newRecipient: newRecipient.publicKey,
                isAssertion: true,
                signer: ReceipentKP,
                newRecipientEmail: null,
            });
        }, "Not permit to do this action", true);
    });

    it("Creator is able to update recipient", async () => {
        console.log("Create vesting plan");
        const program = createLockerProgram(new anchor.Wallet(UserKP));
        let currentBlockTime = await getCurrentBlockTime(program.provider.connection);
        const cliffTime = new BN(currentBlockTime).add(new BN(5));
        let escrow = await createVestingPlan({
            ownerKeypair: UserKP,
            vestingStartTime: new BN(0),
            tokenMint: TOKEN,
            isAssertion: true,
            cliffTime,
            frequency: new BN(1),
            cliffUnlockAmount: new BN(100_000),
            amountPerPeriod: new BN(50_000),
            numberOfPeriod: new BN(2),
            recipient: ReceipentKP.publicKey,
            updateRecipientMode: 1,
        });
        console.log("Update recipient");
        const newRecipient = web3.Keypair.generate();
        invokeAndAssertError(async () => {
            await updateRecipient({
                escrow,
                newRecipient: newRecipient.publicKey,
                isAssertion: true,
                signer: ReceipentKP,
                newRecipientEmail: null,
            });
        }, "Not permit to do this action", true);

        await updateRecipient({
            escrow,
            newRecipient: newRecipient.publicKey,
            isAssertion: true,
            signer: UserKP,
            newRecipientEmail: null,
        });
    });


    it("Recipient is able to update recipient", async () => {
        console.log("Create vesting plan");
        const program = createLockerProgram(new anchor.Wallet(UserKP));
        let currentBlockTime = await getCurrentBlockTime(program.provider.connection);
        const cliffTime = new BN(currentBlockTime).add(new BN(5));
        let escrow = await createVestingPlan({
            ownerKeypair: UserKP,
            vestingStartTime: new BN(0),
            tokenMint: TOKEN,
            isAssertion: true,
            cliffTime,
            frequency: new BN(1),
            cliffUnlockAmount: new BN(100_000),
            amountPerPeriod: new BN(50_000),
            numberOfPeriod: new BN(2),
            recipient: ReceipentKP.publicKey,
            updateRecipientMode: 2,
        });
        console.log("Update recipient");
        const newRecipient = web3.Keypair.generate();
        invokeAndAssertError(async () => {
            await updateRecipient({
                escrow,
                newRecipient: newRecipient.publicKey,
                isAssertion: true,
                signer: UserKP,
                newRecipientEmail: null,
            });
        }, "Not permit to do this action", true);

        await updateRecipient({
            escrow,
            newRecipient: newRecipient.publicKey,
            isAssertion: true,
            signer: ReceipentKP,
            newRecipientEmail: null,
        });
    });

    it("Creator and Recipient is able to update recipient", async () => {
        console.log("Create vesting plan");
        const program = createLockerProgram(new anchor.Wallet(UserKP));
        let currentBlockTime = await getCurrentBlockTime(program.provider.connection);
        const cliffTime = new BN(currentBlockTime).add(new BN(5));
        let escrow = await createVestingPlan({
            ownerKeypair: UserKP,
            vestingStartTime: new BN(0),
            tokenMint: TOKEN,
            isAssertion: true,
            cliffTime,
            frequency: new BN(1),
            cliffUnlockAmount: new BN(100_000),
            amountPerPeriod: new BN(50_000),
            numberOfPeriod: new BN(2),
            recipient: ReceipentKP.publicKey,
            updateRecipientMode: 3,
        });
        console.log("Update recipient");
        await updateRecipient({
            escrow,
            newRecipient: ReceipentKP.publicKey,
            isAssertion: true,
            signer: UserKP,
            newRecipientEmail: null,
        });

        await updateRecipient({
            escrow,
            newRecipient: ReceipentKP.publicKey,
            isAssertion: true,
            signer: ReceipentKP,
            newRecipientEmail: null,
        });
    });


    it("Update both recipient and recipient email", async () => {
        console.log("Create vesting plan");
        const program = createLockerProgram(new anchor.Wallet(UserKP));
        let currentBlockTime = await getCurrentBlockTime(program.provider.connection);
        const cliffTime = new BN(currentBlockTime).add(new BN(5));
        let escrow = await createVestingPlan({
            ownerKeypair: UserKP,
            tokenMint: TOKEN,
            vestingStartTime: new BN(0),
            isAssertion: true,
            cliffTime,
            frequency: new BN(1),
            cliffUnlockAmount: new BN(100_000),
            amountPerPeriod: new BN(50_000),
            numberOfPeriod: new BN(2),
            recipient: ReceipentKP.publicKey,
            updateRecipientMode: 3,
        });

        console.log("Create escrow metadata");
        await createEscrowMetadata({
            escrow,
            name: "Jupiter lock",
            description: "This is jupiter lock",
            creatorEmail: "andrew@raccoons.dev",
            recipientEmail: "max@raccoons.dev",
            creator: UserKP,
            isAssertion: true
        });

        console.log("Update recipient with bigger email size");
        await updateRecipient({
            escrow,
            newRecipient: ReceipentKP.publicKey,
            isAssertion: true,
            signer: UserKP,
            newRecipientEmail: "maximillian@raccoons.dev",
        });

        console.log("Update recipient with smaller email size");
        await updateRecipient({
            escrow,
            newRecipient: ReceipentKP.publicKey,
            isAssertion: true,
            signer: UserKP,
            newRecipientEmail: "max@raccoons.dev",
        });
    });
});
