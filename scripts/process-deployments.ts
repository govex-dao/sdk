import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DeploymentJSON {
  digest: string;
  objectChanges?: Array<{
    type: string;
    packageId?: string;
    objectId?: string;
    objectType?: string;
    owner?: any;
  }>;
}

interface ProcessedDeployment {
  packageName: string;
  transactionDigest: string;
  packageId: string;
  upgradeCap?: {
    objectId: string;
    objectType: string;
    owner: any;
  };
  adminCaps: Array<{
    name: string;
    objectId: string;
    objectType: string;
    owner: any;
  }>;
  sharedObjects: Array<{
    name: string;
    objectId: string;
    objectType: string;
    owner: any;
    initialSharedVersion?: number;
  }>;
  ownedObjects: Array<any>;
}

function extractTypeName(fullType: string): string {
  // Extract the simple name from a type like "0xabc::module::TypeName"
  const parts = fullType.split('::');
  return parts[parts.length - 1];
}

function processDeployment(packageName: string, deploymentPath: string): ProcessedDeployment {
  const rawData: DeploymentJSON = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const objectChanges = rawData.objectChanges ?? [];

  const processed: ProcessedDeployment = {
    packageName,
    transactionDigest: rawData.digest,
    packageId: '',
    adminCaps: [],
    sharedObjects: [],
    ownedObjects: [],
  };

  // Find the published package
  const publishedPkg = objectChanges.find((obj) => obj.type === 'published');
  if (publishedPkg?.packageId) {
    processed.packageId = publishedPkg.packageId;
  }

  // Process all created objects
  const createdObjects = objectChanges.filter((obj) => obj.type === 'created');

  for (const obj of createdObjects) {
    if (!obj.objectType || !obj.objectId) continue;

    // UpgradeCap
    if (obj.objectType.includes('::package::UpgradeCap')) {
      processed.upgradeCap = {
        objectId: obj.objectId,
        objectType: obj.objectType,
        owner: obj.owner,
      };
      continue;
    }

    // Admin caps (anything with "AdminCap" or "OwnerCap" in the name)
    if (obj.objectType.includes('AdminCap') || obj.objectType.includes('OwnerCap')) {
      processed.adminCaps.push({
        name: extractTypeName(obj.objectType),
        objectId: obj.objectId,
        objectType: obj.objectType,
        owner: obj.owner,
      });
      continue;
    }

    // Shared objects
    if (obj.owner && typeof obj.owner === 'object' && 'Shared' in obj.owner) {
      processed.sharedObjects.push({
        name: extractTypeName(obj.objectType),
        objectId: obj.objectId,
        objectType: obj.objectType,
        owner: obj.owner,
        initialSharedVersion: obj.owner.Shared.initial_shared_version,
      });
      continue;
    }
  }

  return processed;
}

function parseArgs(): { network: string } {
  const args = process.argv.slice(2);
  let network = 'devnet'; // default

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--network' && args[i + 1]) {
      network = args[i + 1];
      i++;
    }
  }

  // Validate network
  const validNetworks = ['localnet', 'devnet', 'testnet', 'mainnet'];
  if (!validNetworks.includes(network)) {
    console.error(`Invalid network: ${network}`);
    console.error(`Valid networks: ${validNetworks.join(', ')}`);
    process.exit(1);
  }

  return { network };
}

function main() {
  const { network } = parseArgs();

  console.log(`Processing deployments for network: ${network}`);

  // Network-specific source directory (raw deployment JSONs)
  const deploymentsDir = path.join(__dirname, '../../packages/deployments', network);
  // Output directory for processed files (SDK reads from here)
  const processedDir = path.join(__dirname, '../deployments-processed');

  // Ensure directories exist
  if (!fs.existsSync(deploymentsDir)) {
    console.error(`✗ Deployments directory not found: ${deploymentsDir}`);
    console.error(`  Run: ./deploy_verified.sh --network ${network}`);
    process.exit(1);
  }
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  // Read all deployment JSON files from network-specific directory
  const files = fs.readdirSync(deploymentsDir).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.error(`✗ No deployment JSON files found in: ${deploymentsDir}`);
    process.exit(1);
  }

  const allPackages: Record<string, ProcessedDeployment> = {};

  for (const file of files) {
    const packageName = file.replace('.json', '');
    const deploymentPath = path.join(deploymentsDir, file);

    console.log(`Processing ${packageName}...`);

    try {
      const processed = processDeployment(packageName, deploymentPath);
      allPackages[packageName] = processed;
      console.log(`✓ ${packageName} processed`);
    } catch (error: any) {
      console.error(`✗ Failed to process ${packageName}: ${error.message}`);
    }
  }

  // Write network-specific combined file: _all-packages-{network}.json
  const networkFileName = `_all-packages-${network}.json`;
  const networkFilePath = path.join(processedDir, networkFileName);
  fs.writeFileSync(networkFilePath, JSON.stringify(allPackages, null, 2));
  console.log(`\n✓ Network packages written to ${networkFilePath}`);

  // Also write/update the generic _all-packages.json for backwards compatibility
  // This points to the most recently processed network
  const allPackagesPath = path.join(processedDir, '_all-packages.json');
  fs.writeFileSync(allPackagesPath, JSON.stringify(allPackages, null, 2));
  console.log(`✓ Generic _all-packages.json updated (points to ${network})`);
}

main();
