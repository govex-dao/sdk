import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { initSDK, executeTransaction, getActiveAddress } from './execute-tx';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const sdk = await initSDK();
    const sender = getActiveAddress();

    console.log('Registering new packages in PackageRegistry...\n');

    // Determine network from SDK or environment
    const network = process.env.GOVEX_NETWORK || (typeof sdk.network === 'string' ? sdk.network : sdk.network?.name) || 'localnet';
    console.log(`Network: ${network}\n`);

    // Load all packages from the SDK's processed deployment file
    const allPackagesPath = path.join(__dirname, `../deployments-processed/_all-packages-${network}.json`);

    if (!fs.existsSync(allPackagesPath)) {
        throw new Error(`Deployment file not found: ${allPackagesPath}`);
    }

    console.log(`Loading packages from: _all-packages-${network}.json\n`);
    const deploymentData = JSON.parse(fs.readFileSync(allPackagesPath, 'utf8'));

    // Get AccountProtocol data from the deployment data
    const accountProtocolData = deploymentData.AccountProtocol;
    if (!accountProtocolData) {
        throw new Error('AccountProtocol not found in deployment data');
    }

    const registryObj = accountProtocolData.sharedObjects?.find((obj: any) => obj.name === 'PackageRegistry');
    const REGISTRY = registryObj?.objectId;
    const ADMIN_CAP = accountProtocolData.adminCaps?.find((obj: any) => obj.name === 'PackageAdminCap')?.objectId;
    const ACCOUNT_PROTOCOL_PKG = accountProtocolData.packageId;

    if (!REGISTRY || !ACCOUNT_PROTOCOL_PKG || !ADMIN_CAP) {
        throw new Error('Failed to load PackageRegistry, PackageAdminCap, or AccountProtocol package ID from deployment files');
    }

    console.log(`Using PackageRegistry: ${REGISTRY}`);
    console.log(`Using PackageAdminCap: ${ADMIN_CAP}`);
    console.log(`Using AccountProtocol: ${ACCOUNT_PROTOCOL_PKG}\n`);

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

    // Handle both old format (flat with packageId inside) and new format (packages object)
    const packages = Object.keys(deploymentData)
        .filter(key => !key.startsWith('_')) // Skip metadata keys like _generatedAt
        .map(key => {
            const registryName = nameMapping[key] || key; // Use lowercase for AccountProtocol/AccountActions
            // Handle both formats: { packageId: "0x..." } or just "0x..."
            const pkgData = deploymentData[key];
            const addr = typeof pkgData === 'string' ? pkgData : pkgData.packageId;
            return {
                name: registryName,
                addr,
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
                    tx.object(ADMIN_CAP),
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
