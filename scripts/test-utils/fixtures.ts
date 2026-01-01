/**
 * Test Fixtures and Data Loading Utilities
 *
 * Handles loading and saving test data files like DAO info and conditional coins.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

/**
 * DAO info saved after successful DAO creation.
 *
 * NOTE: With the Sui Currency system migration:
 * - `assetCurrencyId` / `stableCurrencyId` / `lpCurrencyId` are Currency<T> object IDs
 * - These are shared objects created by coin_registry::new_currency_with_otw()
 * - MetadataCap<T> is not stored here as it's typically not needed after DAO creation
 */
export interface DaoInfo {
  accountId: string;
  assetType: string;
  stableType: string;
  lpType: string;
  assetTreasuryCap: string;
  assetCurrencyId: string;    // Currency<AssetType> object ID (shared)
  stableTreasuryCap: string;
  stableCurrencyId: string;   // Currency<StableType> object ID (shared)
  lpTreasuryCap: string;
  lpCurrencyId: string;       // Currency<LP> object ID (shared)
  isStableTreasuryCapShared: boolean;
  stablePackageId: string;
  spotPoolId: string;
  raiseId: string;
  timestamp: number;
  network: string;
  success: boolean;
}

export interface RegistryCoinInfo {
  treasuryCapId: string;
  metadataCapId: string;  // MetadataCap<T> from coin_registry::new_currency_with_otw()
  coinType: string;
}

export interface ConditionalOutcomeCoinSet {
  index: number;
  asset: RegistryCoinInfo;
  stable: RegistryCoinInfo;
}

export interface ConditionalCoinsInfo {
  packageId: string;
  registryId: string;
  [key: string]: any; // Dynamic cond0_asset, cond1_stable, etc.
}

export interface ConditionalTokenRecord {
  coinId: string;
  coinType: string;
  outcomeIndex: number;
  isAsset: boolean;
  owner: string;
  amount?: string;
}

// ============================================================================
// File Paths
// ============================================================================

const SDK_DIR = path.resolve(__dirname, "../..");

export function getDaoInfoPath(): string {
  return path.join(SDK_DIR, "test-dao-info.json");
}

export function getConditionalCoinsInfoPath(): string {
  return path.join(SDK_DIR, "conditional-coins-info.json");
}

export function getTestCoinsInfoPath(): string {
  return path.join(SDK_DIR, "test-coins-info.json");
}

// ============================================================================
// DAO Info
// ============================================================================

export function loadDaoInfo(): DaoInfo {
  const daoInfoPath = getDaoInfoPath();

  if (!fs.existsSync(daoInfoPath)) {
    throw new Error(
      `No DAO info file found at ${daoInfoPath}.\n` +
        `Please run launchpad E2E test first:\n` +
        `  npm run launchpad-e2e-two-outcome`
    );
  }

  return JSON.parse(fs.readFileSync(daoInfoPath, "utf-8"));
}

export function saveDaoInfo(daoInfo: DaoInfo): void {
  const daoInfoPath = getDaoInfoPath();
  fs.writeFileSync(daoInfoPath, JSON.stringify(daoInfo, null, 2));
}

export function daoInfoExists(): boolean {
  return fs.existsSync(getDaoInfoPath());
}

// ============================================================================
// Conditional Coins Info
// ============================================================================

export function loadConditionalCoinsInfo(): ConditionalCoinsInfo | null {
  const infoPath = getConditionalCoinsInfoPath();

  if (!fs.existsSync(infoPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(infoPath, "utf-8"));
}

export function saveConditionalCoinsInfo(info: ConditionalCoinsInfo): void {
  const infoPath = getConditionalCoinsInfoPath();
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
}

export function extractConditionalOutcomes(
  info: Record<string, any>
): ConditionalOutcomeCoinSet[] {
  const outcomeMap = new Map<
    number,
    { asset?: RegistryCoinInfo; stable?: RegistryCoinInfo }
  >();

  for (const [key, value] of Object.entries(info)) {
    const match = key.match(/^cond(\d+)_(asset|stable)$/);
    if (!match) continue;
    const idx = Number(match[1]);
    if (!outcomeMap.has(idx)) {
      outcomeMap.set(idx, {});
    }
    const entry = outcomeMap.get(idx)!;
    if (match[2] === "asset") {
      entry.asset = value as RegistryCoinInfo;
    } else {
      entry.stable = value as RegistryCoinInfo;
    }
  }

  return Array.from(outcomeMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, entry]) => {
      if (!entry.asset || !entry.stable) {
        throw new Error(
          `Incomplete conditional coin info for outcome ${index}`
        );
      }
      return { index, asset: entry.asset, stable: entry.stable };
    });
}

// ============================================================================
// Test Coins Info
// ============================================================================

/**
 * Test coin info after creating coins with coin_registry::new_currency_with_otw()
 *
 * NOTE: This is the new format using the Sui Currency standard.
 * Old format had `metadata: string` (CoinMetadata<T>).
 * New format has:
 *   - `metadataCap: string` (MetadataCap<T>) - for updating metadata
 *   - `currencyId: string` (Currency<T>) - shared object with coin metadata
 *
 * Scripts that previously used `testCoins.*.metadata` should now use
 * `testCoins.*.currencyId` for Currency<T> references.
 */
export interface TestCoinInfo {
  packageId: string;
  type: string;
  treasuryCap: string;
  metadataCap: string;   // MetadataCap<T> - replaces CoinMetadata
  currencyId: string;    // Currency<T> object ID (shared) - auto-created by coin_registry
  isSharedTreasuryCap: boolean;
}

export interface TestCoinsInfo {
  asset: TestCoinInfo;
  stable: TestCoinInfo;
  lp: TestCoinInfo;
  timestamp: number;
  network: string;
}

export function loadTestCoinsInfo(): TestCoinsInfo | null {
  const infoPath = getTestCoinsInfoPath();

  if (!fs.existsSync(infoPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(infoPath, "utf-8"));
}

export function saveTestCoinsInfo(info: TestCoinsInfo): void {
  const infoPath = getTestCoinsInfoPath();
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
}
