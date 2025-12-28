# Test Utilities

A comprehensive set of utilities for writing E2E tests for the Govex Futarchy Protocol on Sui.

## Overview

This module provides everything needed to write robust, maintainable E2E tests for the Futarchy SDK. It addresses common challenges in blockchain testing:

- **Network timing variability** - Localnet, devnet, and testnet have different confirmation times
- **Indexer lag** - Objects may not be immediately queryable after transactions
- **Object reference handling** - Shared vs owned objects require different transaction inputs
- **Test data management** - Loading/saving deployment info between test runs
- **Consistent logging** - Readable output for debugging long-running tests

## Areas Covered

| Area | Modules | Description |
|------|---------|-------------|
| **Timing** | `timing.ts`, `indexer-wait.ts` | Smart waiting, polling, network-aware delays |
| **Data Loading** | `fixtures.ts` | Load DAO info, conditional coins, test coins from JSON |
| **Object Refs** | `object-refs.ts` | Handle shared/owned objects for transaction inputs |
| **Logging** | `logging.ts` | Consistent, colorful test output |
| **Constants** | `constants.ts` | Protocol states, outcome indices, test amounts |
| **Network** | `network.ts` | Network detection, RPC URLs |
| **Validation** | `deployment-validation.ts` | Validate deployment outputs |

## Quick Start

Typical test setup:

```typescript
import {
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
  waitForTimePeriod,
  waitForIndexer,
  TEST_CONFIG,
  logSection,
  logStep,
  logSuccess,
  ACCEPT_OUTCOME_INDEX,
} from "./test-utils";

async function main() {
  logSection("MY E2E TEST");

  // 1. Load test fixtures
  const daoInfo = loadDaoInfo();
  const outcomes = extractConditionalOutcomes(loadConditionalCoinsInfo());

  // 2. Execute transaction
  logStep(1, "CREATE SOMETHING");
  const result = await executeTransaction(sdk, tx, { network });
  logSuccess("Created!");

  // 3. Wait for indexer (only on localnet)
  await waitForIndexer(network, { description: "creation" });

  // 4. Wait for protocol periods
  await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS, {
    description: "trading period"
  });
}
```

## Installation

These utilities are available within the SDK repository. Import them in your test files:

```typescript
import {
  // Timing
  sleep,
  waitForTimePeriod,
  waitForIndexer,
  TEST_CONFIG,

  // Fixtures
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,

  // Logging
  logSection,
  logStep,
  logSuccess,
  logError,

  // Constants
  ACCEPT_OUTCOME_INDEX,
  REJECT_OUTCOME_INDEX,

  // Object refs
  getObjectRef,
  isSharedObject,
} from "./test-utils";
```

## Modules

### 1. Timing (`timing.ts`)

Centralized timing configuration for E2E tests.

```typescript
import { TEST_CONFIG, sleep, waitFor } from "./test-utils";

// Configuration constants
console.log(TEST_CONFIG.REVIEW_PERIOD_MS);     // 5000ms
console.log(TEST_CONFIG.TRADING_PERIOD_MS);    // 10000ms
console.log(TEST_CONFIG.TX_CONFIRMATION_MS);   // 500ms

// Sleep for a duration
await sleep(1000);

// Wait with polling
const result = await waitFor(
  async () => {
    const data = await fetchSomething();
    return data.ready ? data : null;
  },
  {
    maxWait: 30000,
    interval: 1000,
    description: "data to be ready"
  }
);
```

### 2. Indexer Wait (`indexer-wait.ts`)

Smart waiting utilities that adapt to network type.

```typescript
import { waitForIndexer, waitForTimePeriod, waitForProposalState } from "./test-utils";

// Wait for indexer - only waits on localnet, skips on devnet/testnet
await waitForIndexer(network, {
  description: "proposal creation",
  minWait: 1000
});

// Wait with progress logging
await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS + 2000, {
  description: "trading period",
  progressInterval: 5000  // Log progress every 5s
});

// Wait for proposal to reach a specific state
await waitForProposalState(suiClient, proposalId, "trading", {
  maxWait: 60000
});
```

### 3. Fixtures (`fixtures.ts`)

Load test data from JSON files.

```typescript
import {
  loadDaoInfo,
  saveDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
} from "./test-utils";

// Load DAO deployment info
const daoInfo = loadDaoInfo();
console.log(daoInfo.accountId);
console.log(daoInfo.assetType);
console.log(daoInfo.spotPoolId);

// Save DAO info after launchpad
saveDaoInfo({
  accountId: "0x...",
  assetType: "0x...::coin::ASSET",
  stableType: "0x...::coin::STABLE",
  // ...
});

// Load conditional coins and extract outcomes
const coinsInfo = loadConditionalCoinsInfo();
const outcomes = extractConditionalOutcomes(coinsInfo);

for (const outcome of outcomes) {
  console.log(`Outcome ${outcome.index}:`);
  console.log(`  Asset: ${outcome.asset.coinType}`);
  console.log(`  Stable: ${outcome.stable.coinType}`);
}
```

### 4. Object Refs (`object-refs.ts`)

Utilities for working with Sui object references.

```typescript
import {
  getObjectRef,
  getObjectRefById,
  isSharedObject,
  isLocalnet,
  getCreatedObjectsOfType,
} from "./test-utils";

// Get a proper object reference for transaction input
const objRef = await getObjectRef(suiClient, objectIdOrRef, network);

// Check if object is shared
if (isSharedObject(objRef)) {
  // Use sharedObjectRef
} else {
  // Use objectRef
}

// Find created objects by type
const proposals = getCreatedObjectsOfType(txResult, "Proposal");
const escrows = getCreatedObjectsOfType(txResult, "TokenEscrow");
```

### 5. Logging (`logging.ts`)

Consistent logging for test output.

```typescript
import {
  logSection,
  logStep,
  logSuccess,
  logError,
  logInfo,
  logWarning,
  createProgressLogger,
} from "./test-utils";

// Section headers
logSection("TEST: PROPOSAL CREATION");

// Step markers
logStep(1, "CREATE PROPOSAL");

// Status messages
logSuccess("Proposal created successfully");
logError("Failed to create proposal");
logInfo("Waiting for trading period...");
logWarning("TWAP may not have converged");

// Progress logging for long operations
const progress = createProgressLogger("Trading period", 60000);
progress.start();
// ... do work ...
progress.complete();
```

### 6. Constants (`constants.ts`)

Protocol constants and test amounts.

```typescript
import {
  REJECT_OUTCOME_INDEX,
  ACCEPT_OUTCOME_INDEX,
  STATE_TRADING,
  STATE_NAMES,
  getStateName,
  TEST_AMOUNTS,
  EXECUTION_WINDOW_MS,
} from "./test-utils";

// Outcome indices
const rejectOutcome = REJECT_OUTCOME_INDEX;  // 0
const acceptOutcome = ACCEPT_OUTCOME_INDEX;  // 1

// Proposal states
console.log(STATE_TRADING);  // 2
console.log(getStateName(2));  // "TRADING"

// Standard test amounts
const fee = TEST_AMOUNTS.FEE;          // 10_000_000n
const trade = TEST_AMOUNTS.TRADE;      // 100_000_000n
const liquidity = TEST_AMOUNTS.LIQUIDITY;  // 1_000_000_000n

// Execution window (30 minutes)
console.log(EXECUTION_WINDOW_MS);  // 1_800_000
```

### 7. Network (`network.ts`)

Network detection and configuration.

```typescript
import {
  isDevnet,
  isLocalnet,
  getNetworkFromEnv,
  getRpcUrl,
  detectNetworkFromRpc,
} from "./test-utils";

// Get network from environment
const network = getNetworkFromEnv();  // NETWORK env var or "devnet"

// Check network type
if (isLocalnet(network)) {
  // Use longer timeouts
}

// Get RPC URL
const rpcUrl = getRpcUrl(network);

// Detect network from RPC response
const detected = await detectNetworkFromRpc(suiClient);
```

### 8. Deployment Validation (`deployment-validation.ts`)

Validate deployment outputs.

```typescript
import {
  validateAllDeployments,
  validateAllPackagesJson,
  printValidationResults,
  assertDeploymentsValid,
} from "./test-utils";

// Validate all deployments
const { results, totalValid, totalInvalid } = validateAllDeployments(
  "/path/to/deployments"
);
printValidationResults(results, true);

// Quick assertion (throws if invalid)
assertDeploymentsValid("/path/to/deployments");

// Validate processed packages
const validation = validateAllPackagesJson("/path/to/processed", "devnet");
if (validation.valid) {
  console.log(`${validation.packageCount} packages ready`);
}
```

## Complete Example

Here's how a typical E2E test uses these utilities:

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";
import {
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
  waitForTimePeriod,
  waitForIndexer,
  TEST_CONFIG,
  logSection,
  logStep,
  logSuccess,
  logError,
  ACCEPT_OUTCOME_INDEX,
} from "./test-utils";

async function main() {
  logSection("TEST: MY PROPOSAL TEST");

  // Load prerequisites
  logStep(0, "LOAD PREREQUISITES");
  const daoInfo = loadDaoInfo();
  const conditionalCoins = loadConditionalCoinsInfo();
  const outcomes = extractConditionalOutcomes(conditionalCoins);

  const sdk = initSDK();
  const network = "devnet";

  // Create and initialize proposal atomically
  logStep(1, "CREATE AND INITIALIZE PROPOSAL");
  const createTx = sdk.workflows.proposal.createAndInitializeProposal({
    // CreateProposalConfig
    daoAccountId: daoInfo.accountId,
    assetType: daoInfo.assetType,
    stableType: daoInfo.stableType,
    title: "Test Proposal",
    introduction: "Test description",
    metadata: JSON.stringify({ test: true }),
    outcomeMessages: ["Reject", "Accept"],
    outcomeDetails: ["Do nothing", "Execute actions"],
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: feeCoinIds,
    feeAmount: 10_000_000n,
    // Optional: actions to add before finalization
    outcomeActions: [{
      outcomeIndex: ACCEPT_OUTCOME_INDEX,
      actions: [{ type: "memo", message: "Executed!" }],
    }],
    registryId,
    // AdvanceToReviewConfig
    lpType: daoInfo.lpType,
    spotPoolId: daoInfo.spotPoolId,
    senderAddress: activeAddress,
    baseAssetMetadataId: daoInfo.assetMetadata,
    baseStableMetadataId: daoInfo.stableMetadata,
    conditionalCoinsRegistry: {
      registryId: conditionalCoins.registryId,
      coinSets: outcomes.map((o) => ({
        outcomeIndex: o.index,
        assetCoinType: o.asset.coinType,
        assetCapId: o.asset.treasuryCapId,
        stableCoinType: o.stable.coinType,
        stableCapId: o.stable.treasuryCapId,
      })),
    },
  });

  const result = await executeTransaction(sdk, createTx.transaction, { network });
  const proposalId = /* extract from result.objectChanges */;
  const escrowId = /* extract from result.objectChanges */;
  logSuccess(`Proposal: ${proposalId}, Escrow: ${escrowId}`);

  // Wait for indexer
  await waitForIndexer(network, { description: "proposal indexing" });

  // Wait for review period then advance to trading
  logStep(2, "ADVANCE TO TRADING");
  await waitForTimePeriod(TEST_CONFIG.REVIEW_PERIOD_MS + 2000, {
    description: "review period"
  });

  const tradingTx = sdk.workflows.proposal.advanceToTrading({
    proposalId, escrowId, daoAccountId: daoInfo.accountId,
    spotPoolId: daoInfo.spotPoolId, assetType: daoInfo.assetType,
    stableType: daoInfo.stableType, lpType: daoInfo.lpType,
  });
  await executeTransaction(sdk, tradingTx.transaction, { network });

  // Continue with trading, finalization, etc...
}

main().catch((error) => {
  logError(`Test failed: ${error.message}`);
  process.exit(1);
});
```

## Running Validation

Before running tests, validate deployments:

```bash
# Quick validation
npm run validate-deployments

# Verbose output
npm run validate-deployments:verbose

# Specific network
npx tsx scripts/validate-deployments.ts --network testnet
```

## Environment Variables

- `NETWORK` - Target network (localnet, devnet, testnet, mainnet)
- `SUI_RPC_URL` - Custom RPC URL override
- `DEBUG` - Enable debug logging

## Best Practices

1. **Always use `waitForTimePeriod`** instead of raw `sleep()` for protocol periods
2. **Use `waitForIndexer`** after transactions on localnet
3. **Load fixtures** instead of hardcoding object IDs
4. **Use logging utilities** for consistent output
5. **Validate deployments** before running tests
6. **Check network** when timing matters (localnet is faster)
7. **Use `createAndInitializeProposal`** for atomic proposal creation (combines create + add actions + initialize)

## Proposal Lifecycle (New Atomic Pattern)

The SDK now uses an atomic proposal creation pattern that combines multiple steps into a single transaction:

```
OLD FLOW (deprecated):
  createProposal() → addActionsToOutcome() → advanceToReview()
  (3 separate transactions)

NEW FLOW:
  createAndInitializeProposal() → advanceToTrading() → ...
  (1 transaction for creation, then normal flow)
```

### Proposal States

| State | Description | Sponsorship Allowed |
|-------|-------------|---------------------|
| PREMARKET | Initial state (only during atomic creation) | ✅ Yes |
| REVIEW | After initialization, waiting for review period | ✅ Yes |
| TRADING | Active trading period | ✅ Only before TWAP delay |
| FINALIZED | Proposal completed | ❌ No |

### Sponsorship Timing

Sponsorship can be applied in PREMARKET, REVIEW, or early TRADING states:
- **PREMARKET/REVIEW**: Always allowed
- **TRADING**: Only before `trading_start + twap_start_delay`
- **FINALIZED**: Never allowed

This means the atomic `createAndInitializeProposal` flow (which creates proposals in REVIEW state) is fully compatible with sponsorship.
