/**
 * Generate Conditional Coin Move Modules
 *
 * This script dynamically generates conditional coin Move modules for N outcomes.
 * Each outcome needs 2 coins: asset and stable.
 * Module names follow the pattern: conditional_0, conditional_1, etc.
 *
 * Usage:
 *   npx tsx scripts/generate-conditional-coins.ts <num_outcomes>
 *
 * Example:
 *   npx tsx scripts/generate-conditional-coins.ts 4
 *   # Generates conditional_0, conditional_1, conditional_2, conditional_3,
 *   #          conditional_4, conditional_5, conditional_6, conditional_7
 *   # Mapped as: cond0_asset, cond0_stable, cond1_asset, cond1_stable, etc.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONDITIONAL_COIN_PATH = path.join(REPO_ROOT, "packages", "conditional_coin");
const SOURCES_PATH = path.join(CONDITIONAL_COIN_PATH, "sources");

function generateCoinModule(index: number): string {
  const moduleName = `conditional_${index}`;
  const otwName = `CONDITIONAL_${index}`;

  return `// Copyright (c) Govex DAO LLC
// SPDX-License-Identifier: BUSL-1.1

/// Conditional Coin ${index}
/// Module name is "conditional_${index}" for CoinRegistry acceptance
module conditional_coin::${moduleName};

use sui::coin;

/// One-Time Witness for ${otwName}
public struct ${otwName} has drop {}

/// Initialize function called when module is published
fun init(witness: ${otwName}, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = coin::create_currency(
        witness,
        6, // 6 decimals to match test coins
        b"", // Empty symbol for CoinRegistry
        b"", // Empty name for CoinRegistry
        b"", // Empty description for CoinRegistry
        option::none(), // No icon for CoinRegistry
        ctx,
    );

    // Transfer both to sender
    transfer::public_transfer(treasury_cap, ctx.sender());
    transfer::public_transfer(metadata, ctx.sender());
}
`;
}

async function main() {
  const numOutcomes = parseInt(process.argv[2] || "2", 10);

  if (isNaN(numOutcomes) || numOutcomes < 2 || numOutcomes > 10) {
    console.error("Usage: npx tsx scripts/generate-conditional-coins.ts <num_outcomes>");
    console.error("       num_outcomes must be between 2 and 10");
    process.exit(1);
  }

  // Each outcome needs 2 coins (asset + stable)
  const coinCount = numOutcomes * 2;

  console.log("=".repeat(80));
  console.log(`GENERATING CONDITIONAL COINS FOR ${numOutcomes} OUTCOMES (${coinCount} coins)`);
  console.log("=".repeat(80));
  console.log();

  // Clean existing sources
  if (fs.existsSync(SOURCES_PATH)) {
    const existingFiles = fs.readdirSync(SOURCES_PATH);
    for (const file of existingFiles) {
      const filePath = path.join(SOURCES_PATH, file);
      // Check if file should be deleted and still exists
      if ((file.startsWith("conditional_") || file.startsWith("cond")) && file.endsWith(".move")) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`   Removed: ${file}`);
          }
        } catch (err) {
          // File may have been removed by another process, ignore
          console.log(`   Skipped (already removed): ${file}`);
        }
      }
    }
  } else {
    fs.mkdirSync(SOURCES_PATH, { recursive: true });
  }
  console.log();

  // Generate new modules
  console.log("Generating modules:");
  for (let i = 0; i < coinCount; i++) {
    const fileName = `conditional_${i}.move`;
    const content = generateCoinModule(i);
    fs.writeFileSync(path.join(SOURCES_PATH, fileName), content);

    // Show how this maps to outcome asset/stable
    const outcomeIndex = Math.floor(i / 2);
    const isAsset = i % 2 === 0;
    console.log(`   ✅ ${fileName} → cond${outcomeIndex}_${isAsset ? "asset" : "stable"}`);
  }
  console.log();

  console.log("=".repeat(80));
  console.log(`✅ GENERATED ${coinCount} CONDITIONAL COIN MODULES`);
  console.log("=".repeat(80));
  console.log();
  console.log("Mapping:");
  for (let outcome = 0; outcome < numOutcomes; outcome++) {
    console.log(`   Outcome ${outcome}: conditional_${outcome * 2} (asset), conditional_${outcome * 2 + 1} (stable)`);
  }
  console.log();
  console.log("Next steps:");
  console.log("  1. Run: npm run deploy-conditional-coins");
  console.log("  2. Run your tests");
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
