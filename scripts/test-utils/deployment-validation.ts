/**
 * Deployment Validation Utilities
 *
 * Validates deployment outputs and ensures all required objects were created.
 * Use after deploying packages to catch deployment issues early.
 */

import * as fs from "fs";
import * as path from "path";
import { SuiClient } from "@mysten/sui/client";
import { logSuccess, logError, logWarning, logInfo, logSection } from "./logging";

// Expected objects for each package
interface PackageExpectations {
  packageId: boolean;
  upgradeCap: boolean;
  sharedObjects?: string[]; // Names of expected shared objects
  adminCaps?: string[]; // Names of expected admin caps
}

// Default expectations for known packages
const PACKAGE_EXPECTATIONS: Record<string, PackageExpectations> = {
  AccountProtocol: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: ["PackageRegistry"],
    adminCaps: [],
  },
  AccountActions: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: [],
    adminCaps: [],
  },
  futarchy_types: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: [],
    adminCaps: [],
  },
  futarchy_core: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: [],
    adminCaps: [],
  },
  futarchy_factory: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: ["Factory"],
    adminCaps: ["FactoryOwnerCap"],
  },
  futarchy_governance: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: [],
    adminCaps: [],
  },
  conditional_coins: {
    packageId: true,
    upgradeCap: true,
    sharedObjects: [],
    adminCaps: [],
  },
};

export interface DeploymentValidationResult {
  packageName: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  packageId?: string;
  sharedObjects: Array<{ name: string; objectId: string }>;
  adminCaps: Array<{ name: string; objectId: string }>;
}

/**
 * Parse deployment JSON file
 */
export function parseDeploymentJson(filePath: string): any | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Extract type name from full Sui type string
 */
function extractTypeName(fullType: string): string {
  const parts = fullType.split("::");
  return parts[parts.length - 1];
}

/**
 * Validate a single package deployment
 */
export function validateDeployment(
  packageName: string,
  deploymentJson: any,
  expectations?: PackageExpectations
): DeploymentValidationResult {
  const result: DeploymentValidationResult = {
    packageName,
    valid: true,
    errors: [],
    warnings: [],
    sharedObjects: [],
    adminCaps: [],
  };

  const expect = expectations || PACKAGE_EXPECTATIONS[packageName] || {
    packageId: true,
    upgradeCap: true,
  };

  const objectChanges = deploymentJson.objectChanges || [];

  // Check for published package
  const published = objectChanges.find((obj: any) => obj.type === "published");
  if (!published?.packageId) {
    result.errors.push("No published package found in deployment");
    result.valid = false;
  } else {
    result.packageId = published.packageId;
  }

  // Check for upgrade cap
  if (expect.upgradeCap) {
    const upgradeCap = objectChanges.find(
      (obj: any) =>
        obj.type === "created" &&
        obj.objectType?.includes("::package::UpgradeCap")
    );
    if (!upgradeCap) {
      result.warnings.push("No UpgradeCap found (package may not be upgradeable)");
    }
  }

  // Check for expected shared objects
  const createdObjects = objectChanges.filter((obj: any) => obj.type === "created");

  for (const obj of createdObjects) {
    if (!obj.objectType || !obj.objectId) continue;

    const typeName = extractTypeName(obj.objectType);

    // Track shared objects
    if (obj.owner && typeof obj.owner === "object" && "Shared" in obj.owner) {
      result.sharedObjects.push({ name: typeName, objectId: obj.objectId });
    }

    // Track admin caps
    if (obj.objectType.includes("AdminCap") || obj.objectType.includes("OwnerCap")) {
      result.adminCaps.push({ name: typeName, objectId: obj.objectId });
    }
  }

  // Validate expected shared objects
  if (expect.sharedObjects) {
    for (const expectedShared of expect.sharedObjects) {
      const found = result.sharedObjects.find((s) => s.name === expectedShared);
      if (!found) {
        result.errors.push(`Expected shared object "${expectedShared}" not found`);
        result.valid = false;
      }
    }
  }

  // Validate expected admin caps
  if (expect.adminCaps) {
    for (const expectedCap of expect.adminCaps) {
      const found = result.adminCaps.find((c) => c.name === expectedCap);
      if (!found) {
        result.errors.push(`Expected admin cap "${expectedCap}" not found`);
        result.valid = false;
      }
    }
  }

  return result;
}

/**
 * Validate all deployments in a directory
 */
export function validateAllDeployments(deploymentsDir: string): {
  results: DeploymentValidationResult[];
  totalValid: number;
  totalInvalid: number;
} {
  const results: DeploymentValidationResult[] = [];
  let totalValid = 0;
  let totalInvalid = 0;

  if (!fs.existsSync(deploymentsDir)) {
    return { results, totalValid: 0, totalInvalid: 0 };
  }

  const files = fs.readdirSync(deploymentsDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const packageName = file.replace(".json", "");
    const filePath = path.join(deploymentsDir, file);
    const deploymentJson = parseDeploymentJson(filePath);

    if (!deploymentJson) {
      results.push({
        packageName,
        valid: false,
        errors: ["Failed to parse deployment JSON"],
        warnings: [],
        sharedObjects: [],
        adminCaps: [],
      });
      totalInvalid++;
      continue;
    }

    const validation = validateDeployment(packageName, deploymentJson);
    results.push(validation);

    if (validation.valid) {
      totalValid++;
    } else {
      totalInvalid++;
    }
  }

  return { results, totalValid, totalInvalid };
}

/**
 * Verify objects exist on-chain
 */
export async function verifyObjectsOnChain(
  client: SuiClient,
  objectIds: string[]
): Promise<{ verified: string[]; missing: string[] }> {
  const verified: string[] = [];
  const missing: string[] = [];

  for (const objectId of objectIds) {
    try {
      const obj = await client.getObject({ id: objectId });
      if (obj.data) {
        verified.push(objectId);
      } else {
        missing.push(objectId);
      }
    } catch {
      missing.push(objectId);
    }
  }

  return { verified, missing };
}

/**
 * Print validation results
 */
export function printValidationResults(
  results: DeploymentValidationResult[],
  verbose: boolean = false
): void {
  logSection("DEPLOYMENT VALIDATION RESULTS");

  for (const result of results) {
    if (result.valid) {
      logSuccess(`${result.packageName}: ${result.packageId?.substring(0, 16)}...`);
      if (verbose) {
        if (result.sharedObjects.length > 0) {
          logInfo(`  Shared objects: ${result.sharedObjects.map((s) => s.name).join(", ")}`);
        }
        if (result.adminCaps.length > 0) {
          logInfo(`  Admin caps: ${result.adminCaps.map((c) => c.name).join(", ")}`);
        }
      }
    } else {
      logError(`${result.packageName}: INVALID`);
      for (const error of result.errors) {
        logError(`  - ${error}`);
      }
    }

    for (const warning of result.warnings) {
      logWarning(`  ⚠ ${warning}`);
    }
  }

  console.log();
}

/**
 * Quick validation check - throws if any deployment is invalid
 */
export function assertDeploymentsValid(deploymentsDir: string): void {
  const { results, totalInvalid } = validateAllDeployments(deploymentsDir);

  if (totalInvalid > 0) {
    const invalidPackages = results
      .filter((r) => !r.valid)
      .map((r) => r.packageName)
      .join(", ");
    throw new Error(`Invalid deployments: ${invalidPackages}`);
  }
}

/**
 * Load and validate _all-packages.json
 */
export function validateAllPackagesJson(
  processedDir: string,
  network: string = "devnet"
): { valid: boolean; packageCount: number; errors: string[] } {
  const errors: string[] = [];

  // Try network-specific file first
  let allPackagesPath = path.join(processedDir, `_all-packages-${network}.json`);
  if (!fs.existsSync(allPackagesPath)) {
    // Fall back to generic
    allPackagesPath = path.join(processedDir, "_all-packages.json");
  }

  if (!fs.existsSync(allPackagesPath)) {
    return {
      valid: false,
      packageCount: 0,
      errors: ["_all-packages.json not found. Run process-deployments.ts first."],
    };
  }

  try {
    const content = fs.readFileSync(allPackagesPath, "utf8");
    const allPackages = JSON.parse(content);
    const packageCount = Object.keys(allPackages).length;

    // Validate each package has required fields
    for (const [name, pkg] of Object.entries(allPackages)) {
      const p = pkg as any;
      if (!p.packageId) {
        errors.push(`${name}: missing packageId`);
      }
    }

    return {
      valid: errors.length === 0,
      packageCount,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      packageCount: 0,
      errors: [`Failed to parse _all-packages.json: ${error}`],
    };
  }
}
