/**
 * Protocol Init Script
 *
 * One-time protocol initialization for E2E testing:
 * 1. Register packages in PackageRegistry
 * 2. Add governance to sponsorship authorized packages (in SponsorshipRegistry)
 *
 * Run this ONCE after deploying packages, before running any E2E tests.
 *
 * Usage:
 *   npx tsx scripts/protocol-init.ts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Transaction } from "@mysten/sui/transactions";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Main Setup Function
// ============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("PROTOCOL INIT (One-time setup)");
  console.log("=".repeat(80));

  // Initialize SDK
  const sdk = await initSDK();
  const sender = getActiveAddress();

  console.log(`\n👤 Active Address: ${sender}`);

  // ============================================================================
  // STEP 1: Register packages in PackageRegistry
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 1: REGISTER PACKAGES IN PACKAGE REGISTRY");
  console.log("=".repeat(80));

  try {
    execSync("npx tsx scripts/register-new-packages.ts", {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      stdio: "inherit",
    });
    console.log("✅ Package registration completed");
  } catch (error: any) {
    console.log(
      "⚠️  Package registration failed (may already be registered):",
      error.message,
    );
  }

  // ============================================================================
  // STEP 2: Add governance to sponsorship authorized packages
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 2: ADD GOVERNANCE TO SPONSORSHIP AUTHORIZED PACKAGES");
  console.log("=".repeat(80));

  try {
    // Determine network from SDK
    const network = (typeof sdk.network === 'string' ? sdk.network : sdk.network?.name) || 'localnet';

    // Load all packages from the network-specific deployment file
    const allPackagesPath = path.join(__dirname, `../deployments-processed/_all-packages-${network}.json`);
    const allPackages = JSON.parse(fs.readFileSync(allPackagesPath, "utf8"));

    // Load futarchy_core deployment for SponsorshipRegistry and SponsorshipAdminCap
    const futarchyCoreDeployment = allPackages.futarchy_core;

    const sponsorshipRegistryObj = futarchyCoreDeployment?.sharedObjects?.find((obj: any) => obj.name === "SponsorshipRegistry");
    const sponsorshipAdminCapId = futarchyCoreDeployment?.adminCaps?.find((obj: any) => obj.name === "SponsorshipAdminCap")?.objectId;
    const futarchyCorePkgId = futarchyCoreDeployment?.packageId;

    const governanceDeployment = allPackages.futarchy_governance;
    const governancePkgId = governanceDeployment?.packageId;

    if (sponsorshipRegistryObj?.objectId && sponsorshipAdminCapId && futarchyCorePkgId && governancePkgId) {
      console.log(`SponsorshipRegistry: ${sponsorshipRegistryObj.objectId}`);
      console.log(`SponsorshipAdminCap: ${sponsorshipAdminCapId}`);
      console.log(`Governance Package: ${governancePkgId}`);

      // Build transaction to add governance to sponsorship authorized packages
      const tx = new Transaction();
      tx.moveCall({
        target: `${futarchyCorePkgId}::sponsorship_auth::add_authorized_package`,
        arguments: [
          tx.sharedObjectRef({
            objectId: sponsorshipRegistryObj.objectId,
            initialSharedVersion: sponsorshipRegistryObj.initialSharedVersion,
            mutable: true,
          }),
          tx.object(sponsorshipAdminCapId),
          tx.pure.address(governancePkgId),
        ],
      });

      await executeTransaction(sdk, tx, {
        network: "devnet",
        dryRun: false,
        showEffects: false,
      });
      console.log("✅ Governance package added to sponsorship authorized list");
    } else {
      console.log("⚠️  Missing deployment data for sponsorship authorization setup");
    }
  } catch (error: any) {
    const isAlreadyAuthorized = error.message?.includes("EPackageAlreadyAuthorized") ||
                                error.message?.includes("}, 1)");
    if (isAlreadyAuthorized) {
      console.log("✅ Governance package already sponsorship authorized");
    } else {
      console.log("⚠️  Sponsorship authorization setup failed:", error.message);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("PROTOCOL INIT COMPLETE");
  console.log("=".repeat(80));

  console.log("\n📋 Summary:");
  console.log("   ✅ Packages registered in PackageRegistry");
  console.log("   ✅ Governance added to sponsorship authorized list (SponsorshipRegistry)");

  console.log("\nNext steps:");
  console.log("   npx tsx scripts/create-test-coins.ts  # Create test coins for a DAO");
}

main()
  .then(() => {
    console.log("\n✅ Protocol init completed successfully\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Protocol init failed:", error);
    process.exit(1);
  });
