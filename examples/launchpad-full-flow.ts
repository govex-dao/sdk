/**
 * Example: Complete Launchpad Flow
 *
 * This example demonstrates the full lifecycle of a token launchpad:
 * 1. Creating a raise
 * 2. Starting the raise (staging success/failure actions + locking intents)
 * 3. Contributing to the raise
 * 4. Completing the raise (creating DAO)
 * 5. Executing init actions
 * 6. Claiming tokens
 */

import { FutarchySDK, TransactionUtils, LaunchpadService } from '@govex/futarchy-sdk';

async function main() {
    // Initialize SDK with bundled deployments
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

    // Create raise transaction
    const _createTx = sdk.launchpad.createRaise({
        assetType: RAISE_TOKEN_TYPE,
        stableType: STABLE_COIN_TYPE,
        treasuryCap: TREASURY_CAP_ID,
        coinMetadata: COIN_METADATA_ID,
        tokensForSale: BigInt(1000000),
        minRaiseAmount: TransactionUtils.suiToMist(100),
        allowedCaps: [
            TransactionUtils.suiToMist(50),
            TransactionUtils.suiToMist(100),
            TransactionUtils.suiToMist(200),
            LaunchpadService.UNLIMITED_CAP,
        ],
        allowEarlyCompletion: false,
        description: 'Example token launchpad raise',
        affiliateId: '',
        metadataKeys: ['website', 'twitter'],
        metadataValues: ['https://example.com', '@example'],
        launchpadFee: TransactionUtils.suiToMist(1),
        startDelayMs: 5000, // 5 seconds delay
    });

    console.log('Transaction created. Sign and execute to create raise.');

    // NOTE: In real usage, sign and execute:
    /*
    const result = await sdk.client.signAndExecuteTransaction({
        transaction: _createTx,
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

    // ===== STEP 2: Start Raise (Stage Actions + Lock Intents) =====

    console.log('\n📋 Starting raise with success/failure actions...');

    const EXAMPLE_RAISE_ID = '0xRAISE_ID';
    const EXAMPLE_CREATOR_CAP_ID = '0xCREATOR_CAP_ID';
    const BENEFICIARY_ADDRESS = '0xBENEFICIARY';

    // Start raise - stages success and failure actions, then locks intents
    const _startTx = sdk.launchpad.startRaise({
        raiseId: EXAMPLE_RAISE_ID,
        creatorCapId: EXAMPLE_CREATOR_CAP_ID,
        assetType: RAISE_TOKEN_TYPE,
        stableType: STABLE_COIN_TYPE,
        successActions: [
            {
                type: 'create_stream',
                vaultName: 'treasury',
                coinType: RAISE_TOKEN_TYPE, // Coin type for the stream
                beneficiary: BENEFICIARY_ADDRESS,
                amountPerIteration: TransactionUtils.suiToMist(10),
                startTime: Date.now() + 300_000, // 5 minutes from now
                iterationsTotal: 12n, // 12 monthly unlocks
                iterationPeriodMs: 2_592_000_000n, // 30 days in ms
                maxPerWithdrawal: TransactionUtils.suiToMist(10),
                isTransferable: true,
                isCancellable: true,
            },
            {
                type: 'create_pool_with_mint',
                vaultName: 'treasury',
                assetAmount: BigInt(1000),
                stableAmount: BigInt(1000),
                feeBps: 30,
                lpType: '0xYOUR_LP_TOKEN_TYPE',
                lpTreasuryCapId: '0xYOUR_LP_TREASURY_CAP_ID',
                lpMetadataId: '0xYOUR_LP_METADATA_ID',
            },
        ],
        failureActions: [
            {
                type: 'return_treasury_cap',
                recipient: BENEFICIARY_ADDRESS,
            },
            {
                type: 'return_metadata',
                recipient: BENEFICIARY_ADDRESS,
            },
        ],
    });

    console.log('Raise started. Intents locked. Investors can now contribute safely.');

    // ===== STEP 3: Contribute to the Raise =====

    console.log('\n💰 Contributing to raise...');

    const _contributeTx = sdk.launchpad.contribute({
        raiseId: EXAMPLE_RAISE_ID,
        assetType: RAISE_TOKEN_TYPE,
        stableType: STABLE_COIN_TYPE,
        stableCoins: ['0xYOUR_STABLE_COIN_ID'],
        amount: TransactionUtils.suiToMist(50),
        capTier: LaunchpadService.UNLIMITED_CAP,
        crankFee: TransactionUtils.suiToMist(0.1),
    });

    console.log('Contribution transaction created.');

    // ===== STEP 4: Complete Raise (After Deadline) =====

    console.log('\n🎉 Completing successful raise...');

    // After deadline passes and minimum is met, complete the raise
    const _completeTx = sdk.launchpad.complete({
        raiseId: EXAMPLE_RAISE_ID,
        assetType: RAISE_TOKEN_TYPE,
        stableType: STABLE_COIN_TYPE,
    });

    console.log('Complete raise transaction created.');

    // ===== STEP 5: Execute Init Actions =====

    console.log('\n⚡ Executing init actions on new DAO...');

    const EXAMPLE_ACCOUNT_ID = '0xDAO_ACCOUNT_ID'; // From complete result

    const _executeTx = sdk.launchpad.executeActions({
        accountId: EXAMPLE_ACCOUNT_ID,
        raiseId: EXAMPLE_RAISE_ID,
        assetType: RAISE_TOKEN_TYPE,
        stableType: STABLE_COIN_TYPE,
        actionTypes: [
            { type: 'create_stream', coinType: RAISE_TOKEN_TYPE },
            {
                type: 'create_pool_with_mint',
                assetType: RAISE_TOKEN_TYPE,
                stableType: STABLE_COIN_TYPE,
                lpType: '0xYOUR_LP_TOKEN_TYPE',
                lpTreasuryCapId: '0xYOUR_LP_TREASURY_CAP_ID',
                lpMetadataId: '0xYOUR_LP_METADATA_ID',
            },
        ],
    });

    console.log('Execute actions transaction created.');

    // ===== STEP 6: Claim Tokens =====

    console.log('\n🎁 Claiming tokens (for contributors)...');

    const _claimTx = sdk.launchpad.claim(
        EXAMPLE_RAISE_ID,
        RAISE_TOKEN_TYPE,
        STABLE_COIN_TYPE,
    );

    console.log('Claim transaction created. Each contributor calls this once.');

    // ===== Query Raise Data =====

    console.log('\n🔍 Querying raise data...');

    // Get all raises
    const allRaises = await sdk.getRaises();
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
