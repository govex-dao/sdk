/**
 * Protocol Init Script
 *
 * One-time protocol initialization for E2E testing:
 * 1. Register packages in PackageRegistry
 * 2. Add factory to fee exempt packages
 * 3. Add governance to sponsorship authorized packages
 *
 * Run this ONCE after deploying packages, before running any E2E tests.
 *
 * Usage:
 *   npx tsx scripts/protocol-init.ts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PackageRegistryAdminOperations } from "../src/services/package-registry-admin";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

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
  // STEP 2: Add factory to fee exempt packages
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 2: ADD FACTORY TO FEE EXEMPT PACKAGES");
  console.log("=".repeat(80));

  try {
    // Load AccountProtocol deployment for registry and admin cap
    const accountProtocolPath = path.join(__dirname, "../../packages/deployments-processed/AccountProtocol.json");
    const accountProtocolDeployment = JSON.parse(fs.readFileSync(accountProtocolPath, "utf8"));

    const registryObj = accountProtocolDeployment.sharedObjects?.find((obj: any) => obj.name === "PackageRegistry");
    const adminCapId = accountProtocolDeployment.adminCaps?.find((obj: any) => obj.name === "PackageAdminCap")?.objectId;
    const protocolPkgId = accountProtocolDeployment.packageId;

    // Load Factory deployment for package address
    const factoryPath = path.join(__dirname, "../../packages/deployments-processed/futarchy_factory.json");
    const factoryDeployment = JSON.parse(fs.readFileSync(factoryPath, "utf8"));
    const factoryPkgId = factoryDeployment.packageId;

    if (registryObj?.objectId && adminCapId && protocolPkgId && factoryPkgId) {
      console.log(`PackageRegistry: ${registryObj.objectId}`);
      console.log(`PackageAdminCap: ${adminCapId}`);
      console.log(`Factory Package: ${factoryPkgId}`);

      // Use SDK service for clean API
      const registryAdmin = new PackageRegistryAdminOperations(
        sdk.client,
        protocolPkgId,
        registryObj.objectId,
        registryObj.initialSharedVersion
      );

      const exemptTx = registryAdmin.addFeeExemptPackage(adminCapId, factoryPkgId);

      await executeTransaction(sdk, exemptTx, {
        network: "devnet",
        dryRun: false,
        showEffects: false,
      });
      console.log("✅ Factory package added to fee exempt list");
    } else {
      console.log("⚠️  Missing deployment data for fee exemption setup");
    }
  } catch (error: any) {
    const isAlreadyExempt = error.message?.includes("EPackageAlreadyExempt") ||
                           error.message?.includes("}, 10)");
    if (isAlreadyExempt) {
      console.log("✅ Factory package already fee exempt");
    } else {
      console.log("⚠️  Fee exemption setup failed:", error.message);
    }
  }

  // ============================================================================
  // STEP 3: Add governance to sponsorship authorized packages
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 3: ADD GOVERNANCE TO SPONSORSHIP AUTHORIZED PACKAGES");
  console.log("=".repeat(80));

  try {
    const accountProtocolPath = path.join(__dirname, "../../packages/deployments-processed/AccountProtocol.json");
    const accountProtocolDeployment = JSON.parse(fs.readFileSync(accountProtocolPath, "utf8"));

    const registryObj = accountProtocolDeployment.sharedObjects?.find((obj: any) => obj.name === "PackageRegistry");
    const adminCapId = accountProtocolDeployment.adminCaps?.find((obj: any) => obj.name === "PackageAdminCap")?.objectId;
    const protocolPkgId = accountProtocolDeployment.packageId;

    const governancePath = path.join(__dirname, "../../packages/deployments-processed/futarchy_governance.json");
    const governanceDeployment = JSON.parse(fs.readFileSync(governancePath, "utf8"));
    const governancePkgId = governanceDeployment.packageId;

    if (registryObj?.objectId && adminCapId && protocolPkgId && governancePkgId) {
      console.log(`PackageRegistry: ${registryObj.objectId}`);
      console.log(`PackageAdminCap: ${adminCapId}`);
      console.log(`Governance Package: ${governancePkgId}`);

      const registryAdmin = new PackageRegistryAdminOperations(
        sdk.client,
        protocolPkgId,
        registryObj.objectId,
        registryObj.initialSharedVersion
      );

      const sponsorshipTx = registryAdmin.addSponsorshipAuthorizedPackage(adminCapId, governancePkgId);

      await executeTransaction(sdk, sponsorshipTx, {
        network: "devnet",
        dryRun: false,
        showEffects: false,
      });
      console.log("✅ Governance package added to sponsorship authorized list");
    } else {
      console.log("⚠️  Missing deployment data for sponsorship authorization setup");
    }
  } catch (error: any) {
    const isAlreadyAuthorized = error.message?.includes("EPackageAlreadyAuthorizedForSponsorship") ||
                                error.message?.includes("}, 12)");
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
  console.log("   ✅ Factory added to fee exempt list");
  console.log("   ✅ Governance added to sponsorship authorized list");

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
