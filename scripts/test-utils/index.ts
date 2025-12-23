/**
 * Test Utilities Index
 *
 * Re-exports all test utilities from a single entry point.
 *
 * Usage:
 *   import { sleep, loadDaoInfo, getObjectRef, TEST_CONFIG } from './test-utils';
 */

// Object reference utilities
export {
  isSharedObject,
  getObjectRef,
  getObjectRefById,
  getObjId,
  isLocalnet,
  getCreatedObjectsOfType,
  getMutatedObjectsOfType,
} from "./object-refs";

// Timing utilities
export {
  TEST_CONFIG,
  sleep,
  waitFor,
  waitForTxIndexed,
  getNetworkMultiplier,
  getNetworkTiming,
} from "./timing";

// Network utilities
export {
  type NetworkType,
  isDevnet,
  isTestnet,
  isMainnet,
  getDefaultRpcUrl,
  getNetworkFromEnv,
  getRpcUrl,
  detectNetworkFromRpc,
} from "./network";

// Fixture loading utilities
export {
  type DaoInfo,
  type RegistryCoinInfo,
  type ConditionalOutcomeCoinSet,
  type ConditionalCoinsInfo,
  type ConditionalTokenRecord,
  type TestCoinInfo,
  type TestCoinsInfo,
  getDaoInfoPath,
  getConditionalCoinsInfoPath,
  getTestCoinsInfoPath,
  loadDaoInfo,
  saveDaoInfo,
  daoInfoExists,
  loadConditionalCoinsInfo,
  saveConditionalCoinsInfo,
  extractConditionalOutcomes,
  loadTestCoinsInfo,
  saveTestCoinsInfo,
} from "./fixtures";

// Logging utilities
export {
  logSection,
  logStep,
  logSuccess,
  logInfo,
  logError,
  logWarning,
  logDebug,
  logTransaction,
  logObject,
  createProgressLogger,
} from "./logging";

// Constants
export {
  REJECT_OUTCOME_INDEX,
  ACCEPT_OUTCOME_INDEX,
  STATE_PREMARKET,
  STATE_REVIEW,
  STATE_TRADING,
  STATE_AWAITING_EXECUTION,
  STATE_FINALIZED,
  STATE_NAMES,
  getStateName,
  EXECUTION_WINDOW_MS,
  DEFAULT_REVIEW_PERIOD_MS,
  DEFAULT_TRADING_PERIOD_MS,
  TEST_AMOUNTS,
  MAX_U64,
  MAX_U128,
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
} from "./constants";

// Indexer wait utilities
export {
  waitForTxConfirmation,
  waitForObject,
  waitForObjectVersion,
  waitForProposalState,
  waitForIndexer,
  waitForTimePeriod,
} from "./indexer-wait";

// Deployment validation utilities
export {
  type DeploymentValidationResult,
  parseDeploymentJson,
  validateDeployment,
  validateAllDeployments,
  verifyObjectsOnChain,
  printValidationResults,
  assertDeploymentsValid,
  validateAllPackagesJson,
} from "./deployment-validation";

// Re-export types from SDK for convenience
export type {
  ObjectIdOrRef,
  OwnedObjectRef,
  TxSharedObjectRef,
} from "../../src/workflows/types";
