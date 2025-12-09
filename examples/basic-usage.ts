/**
 * Basic usage example for Futarchy SDK
 *
 * This example shows how to:
 * 1. Initialize the SDK (with bundled or custom deployments)
 * 2. Access package IDs
 * 3. Access shared objects (Factory, PackageRegistry)
 * 4. Query on-chain data using the SuiClient
 */

import { FutarchySDK } from '@govex/futarchy-sdk';
// Optional: import custom deployments if you need to override bundled ones
// import customDeployments from './my-custom-deployments.json';

async function main() {
    // Option 1: Use bundled deployments (recommended for standard networks)
    // The SDK includes official deployments for devnet, testnet, and mainnet
    const sdk = new FutarchySDK({
        network: 'devnet',
    });

    // Option 2: Use custom deployments (for local/custom deployments)
    // const sdk = await FutarchySDK.init({
    //     network: 'devnet',
    //     deployments: customDeployments,
    // });

    console.log('✅ SDK initialized');
    console.log('Network:', sdk.network.network);
    console.log('RPC URL:', sdk.network.url);

    // Get package IDs
    const factoryPkgId = sdk.getPackageId('futarchy_factory');
    const governancePkgId = sdk.getPackageId('futarchy_governance');
    console.log('\n📦 Package IDs:');
    console.log('Factory:', factoryPkgId);
    console.log('Governance:', governancePkgId);

    // Access shared objects
    const factory = sdk.deployments.getFactory();
    const registry = sdk.deployments.getPackageRegistry();
    console.log('\n🔗 Shared Objects:');
    console.log('Factory:', factory?.objectId);
    console.log('PackageRegistry:', registry?.objectId);

    // Query Factory object on-chain
    if (factory) {
        const factoryObj = await sdk.client.getObject({
            id: factory.objectId,
            options: { showContent: true },
        });
        console.log('\n🏭 Factory Object:');
        console.log(JSON.stringify(factoryObj.data, null, 2));
    }

    // Get all package IDs
    const allPackages = sdk.getAllPackageIds();
    console.log('\n📚 All Packages:');
    Object.entries(allPackages).forEach(([name, id]) => {
        console.log(`  ${name}: ${id}`);
    });
}

main().catch(console.error);
