/**
 * Protocol Setup Script
 *
 * Convenience script that runs both:
 * 1. protocol-init.ts - One-time package registration
 * 2. create-test-coins.ts - Create test coins for a DAO
 *
 * For running multiple DAOs, run protocol-init once, then create-test-coins per DAO.
 *
 * Usage:
 *   npx tsx scripts/protocol-setup.ts
 */

import { execSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("=".repeat(80));
  console.log("PROTOCOL SETUP (init + create test coins)");
  console.log("=".repeat(80));
  console.log("\nThis is a convenience script that runs:");
  console.log("  1. protocol-init.ts - One-time package registration");
  console.log("  2. create-test-coins.ts - Create test coins for a DAO");
  console.log("\nFor multiple DAOs, run protocol-init once, then create-test-coins per DAO.\n");

  const scriptsDir = __dirname;

  // Step 1: Run protocol-init
  console.log("\n" + "=".repeat(80));
  console.log("Running protocol-init.ts...");
  console.log("=".repeat(80) + "\n");

  execSync("npx tsx scripts/protocol-init.ts", {
    cwd: path.join(scriptsDir, ".."),
    encoding: "utf8",
    stdio: "inherit",
  });

  // Step 2: Run create-test-coins
  console.log("\n" + "=".repeat(80));
  console.log("Running create-test-coins.ts...");
  console.log("=".repeat(80) + "\n");

  execSync("npx tsx scripts/create-test-coins.ts", {
    cwd: path.join(scriptsDir, ".."),
    encoding: "utf8",
    stdio: "inherit",
  });

  console.log("\n" + "=".repeat(80));
  console.log("PROTOCOL SETUP COMPLETE");
  console.log("=".repeat(80));
  console.log("\nNext steps:");
  console.log("   npx tsx scripts/launchpad-e2e.ts             # Run launchpad test");
  console.log("   npx tsx scripts/create-dao-direct.ts         # Or create DAO directly");
}

main()
  .then(() => {
    console.log("\n✅ Protocol setup completed successfully\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Protocol setup failed:", error);
    process.exit(1);
  });
