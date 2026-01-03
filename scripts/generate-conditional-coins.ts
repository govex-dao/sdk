/**
 * Generate Conditional Coin Move Modules
 *
 * This script dynamically generates conditional coin Move modules for N outcomes.
 * Each outcome needs 2 coins: asset and stable.
 * Module names follow the pattern: conditional_0, conditional_1, etc.
 *
 * Usage:
 *   npx tsx scripts/generate-conditional-coins.ts <num_outcomes> [asset_decimals] [stable_decimals]
 *
 * Example:
 *   npx tsx scripts/generate-conditional-coins.ts 4
 *   # Generates 8 modules with default decimals (9 for asset, 6 for stable)
 *
 *   npx tsx scripts/generate-conditional-coins.ts 2 9 6
 *   # Generates 4 modules: asset coins have 9 decimals, stable coins have 6 decimals
 *
 * Mapping:
 *   conditional_0 → outcome 0 asset (uses asset_decimals)
 *   conditional_1 → outcome 0 stable (uses stable_decimals)
 *   conditional_2 → outcome 1 asset (uses asset_decimals)
 *   conditional_3 → outcome 1 stable (uses stable_decimals)
 *   etc.
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

function generateCoinModule(index: number, decimals: number): string {
  const moduleName = `conditional_${index}`;
  const otwName = `CONDITIONAL_${index}`;
  const isAsset = index % 2 === 0;
  const coinType = isAsset ? "asset" : "stable";
  const outcomeIndex = Math.floor(index / 2);

  return `// Copyright (c) Govex DAO LLC
// SPDX-License-Identifier: BUSL-1.1

/// Conditional Coin ${index} (Outcome ${outcomeIndex} ${coinType})
/// Module name is "conditional_${index}" for BlankCoinsRegistry acceptance
/// Uses coin_registry::new_currency_with_otw() for auto-registration with Sui's CoinRegistry
module conditional_coin::${moduleName};

use sui::coin_registry;

/// One-Time Witness for ${otwName}
public struct ${otwName} has drop {}

/// Initialize function called when module is published
/// Creates Currency<T> (transferred to CoinRegistry for later promotion) and TreasuryCap<T>
/// NOTE: Currency<T> becomes owned by CoinRegistry (0xc) after finalize()
/// A second transaction is needed to call coin_registry::finalize_registration()
/// to promote it to a shared object (done by deploy-conditional-coins.ts)
fun init(witness: ${otwName}, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        ${decimals}, // decimals matching base ${coinType} token
        b"Govex Conditional".to_string(), // Symbol (IMMUTABLE) - same for all conditional coins
        b"".to_string(), // Empty name (set by proposal.move)
        b"".to_string(), // Empty description (set by proposal.move)
        b"".to_string(), // Empty icon_url (set by proposal.move)
        ctx,
    );

    // Finalize - this transfers Currency<T> to CoinRegistry (0xc)
    // finalize_registration must be called in a second tx to make it shared
    let metadata_cap = coin_registry::finalize(initializer, ctx);

    // Transfer TreasuryCap to sender for deposit into BlankCoinsRegistry
    transfer::public_transfer(treasury_cap, ctx.sender());
    // Transfer MetadataCap to sender for deposit into BlankCoinsRegistry
    // Used by proposal.move to set name/description/icon
    transfer::public_transfer(metadata_cap, ctx.sender());
}
`;
}

async function main() {
  const numOutcomes = parseInt(process.argv[2] || "2", 10);
  const assetDecimals = parseInt(process.argv[3] || "9", 10); // Default 9 for Sui-native tokens
  const stableDecimals = parseInt(process.argv[4] || "6", 10); // Default 6 for USDC-like stables

  if (isNaN(numOutcomes) || numOutcomes < 2 || numOutcomes > 10) {
    console.error("Usage: npx tsx scripts/generate-conditional-coins.ts <num_outcomes> [asset_decimals] [stable_decimals]");
    console.error("       num_outcomes must be between 2 and 10");
    console.error("       asset_decimals defaults to 9 (Sui-native tokens)");
    console.error("       stable_decimals defaults to 6 (USDC-like stables)");
    process.exit(1);
  }

  if (assetDecimals < 0 || assetDecimals > 18 || stableDecimals < 0 || stableDecimals > 18) {
    console.error("Error: decimals must be between 0 and 18");
    process.exit(1);
  }

  // Each outcome needs 2 coins (asset + stable)
  const coinCount = numOutcomes * 2;

  console.log("=".repeat(80));
  console.log(`GENERATING CONDITIONAL COINS FOR ${numOutcomes} OUTCOMES (${coinCount} coins)`);
  console.log(`  Asset decimals: ${assetDecimals}`);
  console.log(`  Stable decimals: ${stableDecimals}`);
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
    const isAsset = i % 2 === 0;
    const decimals = isAsset ? assetDecimals : stableDecimals;
    const content = generateCoinModule(i, decimals);
    fs.writeFileSync(path.join(SOURCES_PATH, fileName), content);

    // Show how this maps to outcome asset/stable
    const outcomeIndex = Math.floor(i / 2);
    console.log(`   ✅ ${fileName} → cond${outcomeIndex}_${isAsset ? "asset" : "stable"} (${decimals} decimals)`);
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
  console.log(`  1. Run: npm run deploy-conditional-coins -- --decimals ${assetDecimals}:${numOutcomes},${stableDecimals}:${numOutcomes}`);
  console.log("  2. Run your tests");
  console.log();
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
