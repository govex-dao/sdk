/**
 * Generic script to execute SDK transactions
 *
 * This script provides utilities to:
 * - Load the SDK with deployment config
 * - Get the active Sui address from CLI
 * - Sign and execute transactions
 * - Handle results and errors
 */

import { FutarchySDK } from '../src/FutarchySDK';
import { TransactionUtils } from '../src/services/transaction';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Configuration =====

export type Network = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export interface ExecuteConfig {
    network: Network;
    showEffects?: boolean;
    showObjectChanges?: boolean;
    showEvents?: boolean;
    dryRun?: boolean; // If true, only dry run. If false, actually execute
    suppressErrors?: boolean; // If true, don't print error details (useful for expected failures in tests)
}

// ===== Utilities =====

/**
 * Get active address from Sui CLI
 */
export function getActiveAddress(): string {
    return execSync('sui client active-address', { encoding: 'utf8' }).trim();
}

/**
 * Get active environment from Sui CLI
 */
export function getActiveEnv(): Network {
    return execSync('sui client active-env', { encoding: 'utf8' }).trim() as Network;
}

/**
 * Load deployments config from external file
 * @deprecated SDK now bundles deployments - use `new FutarchySDK({ network })` instead
 */
export function loadDeployments(): any {
    const deploymentsPath = path.join(__dirname, '../../packages/deployments-processed/_all-packages.json');
    const data = fs.readFileSync(deploymentsPath, 'utf8');
    return JSON.parse(data);
}

/**
 * Load test coins info from deployment JSON (non-shared TreasuryCaps for launchpad testing)
 *
 * Deployment JSONs are created by running: ./scripts/deploy-test-coins.sh
 * This parses the deployment response instead of hardcoding object IDs (which get deleted on devnet)
 */
export function loadTestCoins(): {
    asset: { packageId: string; type: string; treasuryCap: string; metadata: string };
    stable: { packageId: string; type: string; treasuryCap: string; metadata: string };
} {
    const deploymentsDir = path.join(__dirname, '../deployments');

    // Helper to parse a coin deployment JSON
    const parseCoinDeployment = (coinName: string) => {
        const deploymentPath = path.join(deploymentsDir, `${coinName}.json`);

        if (!fs.existsSync(deploymentPath)) {
            throw new Error(
                `❌ ${coinName} deployment not found at: ${deploymentPath}\n` +
                `   Run: cd ${path.join(__dirname, '..')} && ./scripts/deploy-test-coins.sh`
            );
        }

        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

        // Extract package ID
        const packageId = deployment.objectChanges?.find(
            (obj: any) => obj.type === 'published'
        )?.packageId;

        // Extract TreasuryCap object
        const treasuryCapObj = deployment.objectChanges?.find(
            (obj: any) => obj.objectType?.includes('::coin::TreasuryCap')
        );

        // Extract CoinMetadata object
        const metadataObj = deployment.objectChanges?.find(
            (obj: any) => obj.objectType?.includes('::coin::CoinMetadata')
        );

        if (!packageId || !treasuryCapObj || !metadataObj) {
            throw new Error(
                `❌ Invalid ${coinName} deployment JSON. Missing required objects.\n` +
                `   Redeploy: ./scripts/deploy-test-coins.sh`
            );
        }

        // Extract coin type from TreasuryCap type (removes TreasuryCap wrapper)
        const coinType = treasuryCapObj.objectType.match(/<(.+)>/)?.[1];

        if (!coinType) {
            throw new Error(`❌ Could not extract coin type from: ${treasuryCapObj.objectType}`);
        }

        return {
            packageId,
            type: coinType,
            treasuryCap: treasuryCapObj.objectId,
            metadata: metadataObj.objectId,
        };
    };

    return {
        asset: parseCoinDeployment('test_asset'),
        stable: parseCoinDeployment('test_stable'),
    };
}

/**
 * Initialize SDK with current network
 * Uses bundled deployments by default (no file loading needed for devnet)
 */
export function initSDK(network?: Network): FutarchySDK {
    const actualNetwork = network || getActiveEnv();

    console.log(`🚀 Initializing SDK on ${actualNetwork}...`);

    // SDK now uses bundled deployments automatically for supported networks
    const sdk = new FutarchySDK({
        network: actualNetwork,
    });

    console.log(`✅ SDK initialized`);
    console.log(`   Network: ${sdk.network.network}`);
    console.log(`   RPC: ${sdk.network.url}`);

    return sdk;
}

/**
 * Execute a transaction using Sui CLI
 * This method doesn't require managing keypairs - uses whatever is active in sui CLI
 */
export async function executeTransaction(
    sdk: FutarchySDK,
    tx: Transaction,
    config: ExecuteConfig = { network: 'devnet', showEffects: true, showObjectChanges: true, showEvents: true, dryRun: false }
): Promise<any> {
    const sender = getActiveAddress();
    console.log(`\n📝 ${config.dryRun ? 'Dry running' : 'Executing'} transaction...`);
    console.log(`   Sender: ${sender}`);

    try {
        // Set the sender on the transaction
        tx.setSender(sender);

        if (config.dryRun) {
            // Serialize the transaction for dry run
            const serializedTx = await tx.build({ client: sdk.client });

            const result = await sdk.client.dryRunTransactionBlock({
                transactionBlock: serializedTx,
            });

            console.log('\n✅ Dry run successful!');
            console.log('   Status:', result.effects.status.status);

            if (result.effects.status.status === 'failure') {
                console.log('\n❌ Transaction would fail with error:');
                console.log(JSON.stringify(result.effects.status, null, 2));
                throw new Error(`Transaction dry run failed: ${JSON.stringify(result.effects.status.error)}`);
            }

            return {
                success: true,
                dryRun: result,
                transaction: tx,
                note: 'Dry run completed. To execute for real, set dryRun: false',
            };
        } else {
            // Actually execute the transaction
            console.log('\n⚡ Executing transaction on-chain FOR REAL...');

            // Get keypair from sui config
            const suiConfigPath = path.join(require('os').homedir(), '.sui', 'sui_config', 'client.yaml');
            const configYaml = fs.readFileSync(suiConfigPath, 'utf8');

            // Extract keystore path
            const keystoreMatch = configYaml.match(/keystore:\s*\n\s*File:\s*(.+)/);
            if (!keystoreMatch) {
                throw new Error('Could not find keystore path in sui config');
            }

            const keystorePath = keystoreMatch[1].trim().replace('~', require('os').homedir());
            const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));

            // Find the keypair for the active address
            const activeAddress = sender;
            let privateKeyBase64: string | null = null;

            for (const key of keystore) {
                try {
                    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(key, 'base64').slice(1));
                    if (keypair.getPublicKey().toSuiAddress() === activeAddress) {
                        privateKeyBase64 = key;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!privateKeyBase64) {
                throw new Error(`Could not find keypair for address ${activeAddress}`);
            }

            const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKeyBase64, 'base64').slice(1));

            const result = await sdk.client.signAndExecuteTransaction({
                transaction: tx,
                signer: keypair,
                options: {
                    showEffects: config.showEffects,
                    showObjectChanges: config.showObjectChanges,
                    showEvents: config.showEvents,
                },
            });

            // Debug: log the full result structure
            if (!result.effects) {
                console.log('\n⏳ No effects returned immediately, waiting for confirmation...');
                const waitResult = await sdk.client.waitForTransaction({
                    digest: result.digest,
                    options: {
                        showEffects: true,
                        showObjectChanges: config.showObjectChanges,
                        showEvents: config.showEvents,
                    }
                });
                // Copy effects back to result
                result.effects = waitResult.effects;
                result.objectChanges = waitResult.objectChanges;
                result.events = waitResult.events;
            }

            if (result.effects?.status?.status === 'success') {
                console.log('\n✅ Transaction executed successfully!');
                console.log(`   Digest: ${result.digest}`);

                if (config.showObjectChanges && result.objectChanges) {
                    console.log(`\n📦 Object Changes:`);
                    result.objectChanges.forEach((change: any) => {
                        if (change.type === 'created') {
                            console.log(`   Created: ${change.objectType}`);
                            console.log(`     ID: ${change.objectId}`);
                        } else if (change.type === 'mutated') {
                            console.log(`   Mutated: ${change.objectType}`);
                            console.log(`     ID: ${change.objectId}`);
                        } else if (change.type === 'transferred') {
                            console.log(`   Transferred to: ${change.recipient.AddressOwner || change.recipient}`);
                            console.log(`     ID: ${change.objectId}`);
                        }
                    });
                }

                if (config.showEvents && result.events && result.events.length > 0) {
                    console.log(`\n📢 Events:`);
                    result.events.forEach((event: any) => {
                        console.log(`   ${event.type}`);
                        console.log(`   ${JSON.stringify(event.parsedJson, null, 2)}`);
                    });
                }

                return result;
            } else {
                console.error('\n❌ Transaction failed!');
                console.error('Status:', JSON.stringify(result.effects?.status, null, 2));
                console.error('Effects:', JSON.stringify(result.effects, null, 2));
                throw new Error(`Transaction failed: ${JSON.stringify(result.effects?.status)}`);
            }
        }
    } catch (error) {
        if (!config.suppressErrors) {
            console.error('\n❌ Transaction failed:', error);

            // Try to print more details if available
            if ((error as any).cause?.effects?.status) {
                console.error('\nStatus:', JSON.stringify((error as any).cause.effects.status, null, 2));
            }
        }

        throw error;
    }
}

/**
 * Execute with keypair (if available)
 * WARNING: Only use with test keypairs, never production keys!
 */
export async function executeTransactionWithKeypair(
    sdk: FutarchySDK,
    tx: Transaction,
    keypair: Ed25519Keypair,
    config: ExecuteConfig = { network: 'devnet', showEffects: true, showObjectChanges: true, showEvents: true }
): Promise<any> {
    console.log(`\n📝 Executing transaction with keypair...`);
    console.log(`   Sender: ${keypair.getPublicKey().toSuiAddress()}`);

    try {
        const result = await sdk.client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: {
                showEffects: config.showEffects,
                showObjectChanges: config.showObjectChanges,
                showEvents: config.showEvents,
            },
        });

        if (result.effects?.status?.status === 'success') {
            console.log('\n✅ Transaction successful!');
            console.log(`   Digest: ${result.digest}`);

            if (config.showObjectChanges && result.objectChanges) {
                console.log(`\n📦 Object Changes:`);
                result.objectChanges.forEach((change: any) => {
                    if (change.type === 'created') {
                        console.log(`   Created: ${change.objectType}`);
                        console.log(`     ID: ${change.objectId}`);
                    }
                });
            }

            if (config.showEvents && result.events && result.events.length > 0) {
                console.log(`\n📢 Events:`);
                result.events.forEach((event: any) => {
                    console.log(`   ${event.type}`);
                    console.log(`   ${JSON.stringify(event.parsedJson, null, 2)}`);
                });
            }

            return result;
        } else {
            console.error('\n❌ Transaction failed:', result.effects?.status);
            throw new Error(`Transaction failed: ${JSON.stringify(result.effects?.status)}`);
        }
    } catch (error) {
        console.error('\n❌ Transaction execution failed:', error);
        throw error;
    }
}

/**
 * Pretty print transaction for debugging
 */
export function printTransaction(tx: Transaction): void {
    console.log('\n📋 Transaction Details:');
    console.log(JSON.stringify(tx, null, 2));
}

/**
 * Helper to wait for transaction confirmation
 */
export async function waitForTransaction(sdk: FutarchySDK, digest: string): Promise<any> {
    console.log(`\n⏳ Waiting for transaction ${digest}...`);
    const result = await sdk.client.waitForTransaction({
        digest,
        options: {
            showEffects: true,
            showObjectChanges: true,
            showEvents: true,
        },
    });
    console.log('✅ Transaction confirmed');
    return result;
}

/**
 * Wait for objects to be indexed and available on RPC
 * Useful for localnet where objects may take a moment to be visible
 */
export async function waitForObjects(
    sdk: FutarchySDK,
    objectIds: string[],
    maxAttempts: number = 30,
    delayMs: number = 500
): Promise<void> {
    console.log(`\n⏳ Waiting for ${objectIds.length} objects to be indexed...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const results = await sdk.client.multiGetObjects({
                ids: objectIds,
                options: { showContent: false }
            });

            const allExist = results.every(r => r.data !== null && r.data !== undefined);

            if (allExist) {
                console.log(`✅ All objects are now indexed (attempt ${attempt})`);
                return;
            }

            const missing = results.filter(r => !r.data).length;
            process.stdout.write(`.`);

            await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (error) {
            // Objects may throw errors if they don't exist yet
            process.stdout.write(`x`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    console.log('');
    throw new Error(`Objects not found after ${maxAttempts} attempts: ${objectIds.join(', ')}`);
}

// ===== Export everything =====
export default {
    getActiveAddress,
    getActiveEnv,
    loadDeployments,
    loadTestCoins,
    initSDK,
    executeTransaction,
    executeTransactionWithKeypair,
    printTransaction,
    waitForTransaction,
    waitForObjects,
};
