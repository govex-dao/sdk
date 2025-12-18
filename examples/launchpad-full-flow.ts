/**
 * Example: Complete Launchpad Flow
 *
 * This example demonstrates the full lifecycle of a token launchpad:
 * 1. Creating a raise
 * 2. Staging init actions (success/failure specs)
 * 3. Locking intents
 * 4. Contributing to the raise
 * 5. Completing the raise (creating DAO)
 * 6. Claiming tokens
 */

import { FutarchySDK, LaunchpadWorkflow, TransactionUtils } from '../src';

async function main() {
    // Initialize SDK - bundled deployments are used automatically for devnet
    const sdk = new FutarchySDK({
        network: 'devnet',
    });

    console.log('✅ SDK initialized');
    console.log('Network:', sdk.network.network);

    // ===== STEP 1: Create a Token Raise =====

    console.log('\n📝 Creating a token launchpad raise...');

    // Example types and IDs (replace with your actual values)
    const RAISE_TOKEN_TYPE = '0xYOUR_PACKAGE::your_coin::YOUR_COIN';
    const STABLE_COIN_TYPE = '0x2::sui::SUI';
    const TREASURY_CAP_ID = '0xYOUR_TREASURY_CAP_ID';
    const COIN_METADATA_ID = '0xYOUR_COIN_METADATA_ID';

    // Calculate deadline: 7 days from now
    const deadlineMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    // Start time: 5 seconds from now
    const startTimeMs = Date.now() + 5000;

    const createTx = sdk.workflows.launchpad.createRaise({
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
        treasuryCap: TREASURY_CAP_ID,
        coinMetadata: COIN_METADATA_ID,
        tokensForSale: BigInt(1000000),
        minRaiseAmount: TransactionUtils.suiToMist(100),
        allowedCaps: [
            TransactionUtils.suiToMist(50),
            TransactionUtils.suiToMist(100),
            TransactionUtils.suiToMist(200),
            LaunchpadWorkflow.UNLIMITED_CAP,
        ],
        allowEarlyCompletion: false,
        description: 'Example token launchpad raise',
        affiliateId: '',
        metadataKeys: ['website', 'twitter'],
        metadataValues: ['https://example.com', '@example'],
        launchpadFee: TransactionUtils.suiToMist(1),
        deadlineMs,
        startTimeMs,
    });

    console.log('Transaction created. Sign and execute to create raise.');

    // NOTE: In real usage, sign and execute:
    /*
    const result = await sdk.client.signAndExecuteTransaction({
        transaction: createTx,
        signer: keypair,
        options: {
            showEffects: true,
            showObjectChanges: true,
            showEvents: true,
        },
    });

    // Extract Raise and CreatorCap from result.objectChanges
    const raiseId = ...;
    const creatorCapId = ...;
    */

    // ===== STEP 2: Stage Success/Failure Init Actions =====

    console.log('\n📋 Staging success init actions...');

    const EXAMPLE_RAISE_ID = '0xRAISE_ID';
    const EXAMPLE_CREATOR_CAP_ID = '0xCREATOR_CAP_ID';
    const BENEFICIARY_ADDRESS = '0xBENEFICIARY';

    // Stage a stream and AMM pool for success case
    const stageSuccessTx = sdk.workflows.launchpad.stageSuccessInitActions({
        raiseId: EXAMPLE_RAISE_ID,
        creatorCapId: EXAMPLE_CREATOR_CAP_ID,
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
        vaultName: 'treasury',
        streamBeneficiary: BENEFICIARY_ADDRESS,
        streamAmount: TransactionUtils.suiToMist(100),
        streamDurationMs: BigInt(365 * 24 * 60 * 60 * 1000), // 1 year
        poolAssetAmount: BigInt(1000),
        poolStableAmount: BigInt(1000),
        poolFeeBps: 30,
    });

    console.log('Success actions staged.');

    console.log('\n📋 Staging failure init actions...');

    // Stage failure actions (return TreasuryCap to creator)
    const stageFailureTx = sdk.workflows.launchpad.stageFailureInitActions({
        raiseId: EXAMPLE_RAISE_ID,
        creatorCapId: EXAMPLE_CREATOR_CAP_ID,
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
        recipient: BENEFICIARY_ADDRESS,
    });

    console.log('Failure actions staged.');

    // ===== STEP 3: Lock Intents =====

    console.log('\n🔒 Locking intents...');

    const lockTx = sdk.workflows.launchpad.lockIntents({
        raiseId: EXAMPLE_RAISE_ID,
        creatorCapId: EXAMPLE_CREATOR_CAP_ID,
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
    });

    console.log('Intents locked. Investors can now contribute safely.');

    // ===== STEP 4: Contribute to the Raise =====

    console.log('\n💰 Contributing to raise...');

    const contributeTx = sdk.workflows.launchpad.contribute({
        raiseId: EXAMPLE_RAISE_ID,
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
        stablePaymentCoin: '0xYOUR_STABLE_COIN_ID',
        maxTotalCap: LaunchpadWorkflow.UNLIMITED_CAP,
    });

    console.log('Contribution transaction created.');

    // ===== STEP 5: Complete Raise (After Deadline) =====

    console.log('\n🎉 Completing successful raise...');

    // After deadline passes and minimum is met, complete the raise
    const completeTx = sdk.workflows.launchpad.completeRaise({
        raiseId: EXAMPLE_RAISE_ID,
        creatorCapId: EXAMPLE_CREATOR_CAP_ID,
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
        daoCreationFee: TransactionUtils.suiToMist(1),
    });

    console.log('Complete raise transaction created (requires CreatorCap).');

    // ===== STEP 6: Claim Tokens =====

    console.log('\n🎁 Claiming tokens (for contributors)...');

    const claimTx = sdk.workflows.launchpad.claimTokens({
        raiseId: EXAMPLE_RAISE_ID,
        raiseTokenType: RAISE_TOKEN_TYPE,
        stableCoinType: STABLE_COIN_TYPE,
    });

    console.log('Claim transaction created. Each contributor calls this once.');

    // ===== Query Raise Data =====

    console.log('\n🔍 Querying raise data...');

    const factoryPackageId = sdk.getPackageId('futarchy_factory')!;

    // Get all raises
    const allRaises = await sdk.query.getAllRaises(factoryPackageId);
    console.log(`\nTotal raises: ${allRaises.length}`);

    if (allRaises.length > 0) {
        const recentRaise = allRaises[allRaises.length - 1];
        console.log('\nMost Recent Raise:');
        console.log('  Raise ID:', recentRaise.raise_id);
        console.log('  Creator:', recentRaise.creator);
        console.log('  Min Raise:', recentRaise.min_raise_amount);
        console.log('  Description:', recentRaise.description);
    }

    console.log('\n✅ All launchpad operations demonstrated!');
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
