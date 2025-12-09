import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { initSDK, executeTransaction, getActiveAddress } from './execute-tx';

import accountProtocolDeployment from '../deployments/accountProtocol.json';
import deployments from '../deployments/_all-packages.json';

async function main() {
    const sdk = await initSDK();
    const sender = getActiveAddress();

    console.log('Registering new packages in PackageRegistry...\n');

    // Load PackageRegistry and AccountProtocol addresses from deployment files
    const REGISTRY = accountProtocolDeployment.sharedObjects.find((obj: any) => obj.name === 'PackageRegistry')?.objectId;
    const ACCOUNT_PROTOCOL_PKG = accountProtocolDeployment.packageId;

    if (!REGISTRY || !ACCOUNT_PROTOCOL_PKG) {
        throw new Error('Failed to load PackageRegistry or AccountProtocol package ID from deployment files');
    }

    console.log(`Using PackageRegistry: ${REGISTRY}`);
    console.log(`Using AccountProtocol: ${ACCOUNT_PROTOCOL_PKG}\n`);

    // Use packages from deployments JSON (imported from _all-packages.json)
    // Extract packageId from each deployment entry
    const allPackages: Record<string, string> = {};
    for (const [name, data] of Object.entries(deployments)) {
        const pkgData = data as { packageId?: string };
        if (pkgData.packageId) {
            allPackages[name] = pkgData.packageId;
        }
    }
    console.log(`Loading ${Object.keys(allPackages).length} packages from deployments/_all-packages.json\n`);

    // Map package names to lowercase for registry (factory expects lowercase names)
    const nameMapping: Record<string, string> = {
        'AccountProtocol': 'account_protocol',
        'AccountActions': 'account_actions',
    };

    // Define action types for packages that provide them
    const actionTypesMap: Record<string, string[]> = {
        'account_actions': [
            'account_actions::stream_init_actions::CreateStreamAction',
            'account_actions::currency_init_actions::ReturnTreasuryCapAction',
        ],
        // Add more as needed
    };

    const packages = Object.keys(allPackages).map(key => {
        const registryName = nameMapping[key] || key; // Use lowercase for AccountProtocol/AccountActions
        return {
            name: registryName,
            addr: allPackages[key], // Direct access since it's just packageId string
            version: 1,
            actionTypes: actionTypesMap[registryName] || [],
            category: registryName.includes('actions') ? 'Actions' : registryName.includes('governance') ? 'Governance' : 'Core',
            description: `${registryName} package`
        };
    });

    // Skip removal step for fresh registry (nothing to remove)
    console.log('✓ Skipping removal step (fresh registry)\n');

    // Now register all packages with correct names
    for (const pkg of packages) {
        console.log(`Registering ${pkg.name}...`);

        try {
            const tx = new Transaction();
            const actionTypesVector = tx.pure(bcs.vector(bcs.string()).serialize(pkg.actionTypes));
            tx.moveCall({
                target: `${ACCOUNT_PROTOCOL_PKG}::package_registry::add_package`,
                arguments: [
                    tx.object(REGISTRY),
                    tx.pure.string(pkg.name),
                    tx.pure.address(pkg.addr),
                    tx.pure.u64(pkg.version),
                    actionTypesVector,
                    tx.pure.string(pkg.category),
                    tx.pure.string(pkg.description),
                ],
            });

            await executeTransaction(sdk, tx, {
                network: 'devnet',
                dryRun: false,
                showEffects: false,
                showObjectChanges: false,
                showEvents: false,
            });

            console.log(`✓ ${pkg.name} registered\n`);
        } catch (error: any) {
            // Error code 1 = EPackageAlreadyExists
            const isAlreadyExists = error.message?.includes('EPackageAlreadyExists') ||
                                   error.message?.includes('}, 1)'); // Abort code 1
            if (isAlreadyExists) {
                console.log(`ℹ️  ${pkg.name} already registered\n`);
            } else {
                console.error(`✗ Failed to register ${pkg.name}: ${error.message}\n`);
            }
        }
    }

    console.log('✓ All packages registered successfully!');
}

main().catch(console.error);
