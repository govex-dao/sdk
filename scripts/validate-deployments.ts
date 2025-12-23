#!/usr/bin/env npx tsx
/**
 * Validate Deployments CLI
 *
 * Validates all deployment outputs to ensure packages deployed correctly.
 *
 * Usage:
 *   npx tsx scripts/validate-deployments.ts [--verbose] [--network <network>]
 */

import * as path from "path";
import {
  validateAllDeployments,
  validateAllPackagesJson,
  printValidationResults,
  logSection,
  logSuccess,
  logError,
  logInfo,
} from "./test-utils";

const DEPLOYMENTS_DIR = path.resolve(__dirname, "../../packages/deployments");
const PROCESSED_DIR = path.resolve(__dirname, "../../packages/deployments-processed");

function parseArgs(): { verbose: boolean; network: string } {
  const args = process.argv.slice(2);
  let verbose = false;
  let network = "devnet";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verbose" || args[i] === "-v") {
      verbose = true;
    } else if (args[i] === "--network" && args[i + 1]) {
      network = args[i + 1];
      i++;
    }
  }

  return { verbose, network };
}

async function main() {
  const { verbose, network } = parseArgs();

  logSection("DEPLOYMENT VALIDATION");
  logInfo(`Network: ${network}`);
  logInfo(`Deployments: ${DEPLOYMENTS_DIR}`);
  logInfo(`Processed: ${PROCESSED_DIR}`);
  console.log();

  // Validate raw deployments
  logSection("RAW DEPLOYMENT JSONS");
  const { results, totalValid, totalInvalid } = validateAllDeployments(DEPLOYMENTS_DIR);

  if (results.length === 0) {
    logError("No deployment JSONs found!");
    logInfo("Run: ./packages/deploy_verified.sh first");
    process.exit(1);
  }

  printValidationResults(results, verbose);

  logInfo(`Valid: ${totalValid} | Invalid: ${totalInvalid} | Total: ${results.length}`);
  console.log();

  // Validate processed _all-packages.json
  logSection("PROCESSED PACKAGES");
  const allPkgValidation = validateAllPackagesJson(PROCESSED_DIR, network);

  if (allPkgValidation.valid) {
    logSuccess(`_all-packages-${network}.json: ${allPkgValidation.packageCount} packages`);
  } else {
    logError(`_all-packages-${network}.json: INVALID`);
    for (const error of allPkgValidation.errors) {
      logError(`  - ${error}`);
    }
  }
  console.log();

  // Summary
  logSection("SUMMARY");
  const allValid = totalInvalid === 0 && allPkgValidation.valid;

  if (allValid) {
    logSuccess("All deployments validated successfully!");
    console.log();
    console.log("Ready to run tests:");
    console.log("  npm run launchpad-e2e-two-outcome");
    console.log("  npm run test:proposal-with-swaps");
    process.exit(0);
  } else {
    logError("Some deployments are invalid!");
    console.log();
    console.log("Recommended actions:");
    if (totalInvalid > 0) {
      console.log("  1. Re-run deployment: ./packages/deploy_verified.sh");
    }
    if (!allPkgValidation.valid) {
      console.log("  2. Process deployments: npx tsx scripts/process-deployments.ts");
    }
    process.exit(1);
  }
}

main().catch((error) => {
  logError(`Validation failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
