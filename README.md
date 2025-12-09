# Futarchy SDK

TypeScript SDK for the Futarchy Protocol on Sui.

## Installation

```bash
pnpm add @govex/futarchy-sdk
```

## SDK Structure

See [SDK_STRUCTURE.md](./SDK_STRUCTURE.md) for the complete API reference.

## Quick Start

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({ network: 'devnet' });
```

## Importing Types

Types are available from a dedicated entry point:

```typescript
// Import types separately
import type {
  DAOInfo,
  CreateRaiseConfig,
  ActionConfig,
  LaunchpadWorkflowPackages,
} from '@govex/futarchy-sdk/types';

```

## Common Patterns

### Token Launch (Launchpad)

```typescript
// 1. Create a raise
const createTx = await sdk.launchpad.createRaise({
  assetType: '0x...::coin::MYCOIN',
  stableType: '0x2::sui::SUI',
  treasuryCap: '0x...',
  coinMetadata: '0x...',
  tokensForSale: 1_000_000_000n,
  minRaiseAmount: 100_000_000n,
  allowedCaps: [1_000_000_000n],
  allowEarlyCompletion: true,
  description: 'My token launch',
  launchpadFee: 1_000_000_000n,
});

// 2. Contribute to a raise
const contributeTx = await sdk.launchpad.contribute({
  raiseId: '0x...',
  amount: 10_000_000n,
  coinId: '0x...',
});

// 3. Query raise info
const raise = await sdk.launchpad.getRaise('0x...');
const totalRaised = await sdk.launchpad.getTotalRaised('0x...');
```

### Governance Proposal

```typescript
// 1. Create a proposal
const createTx = await sdk.proposal.create({
  daoAccountId: '0x...',
  assetType: '0x...::coin::MYCOIN',
  stableType: '0x2::sui::SUI',
  title: 'Fund development',
  introduction: 'Proposal to fund Q1 development',
  metadata: '{}',
  outcomeMessages: ['Reject', 'Accept'],
  outcomeDetails: ['Do nothing', 'Fund 100k tokens'],
  proposer: '0x...',
  treasuryAddress: '0x...',
  usedQuota: false,
  feeCoins: ['0x...'],
  feeAmount: 1_000_000n,
});

// 2. Trade on proposal outcomes
const tradeTx = await sdk.proposal.trade.stableForAsset({
  proposalId: '0x...',
  outcomeIndex: 1, // Trade on "Accept" outcome
  amountIn: 1_000_000n,
  minAmountOut: 950_000n,
  coinId: '0x...',
});

// 3. Query proposal info
const proposal = await sdk.proposal.getInfo('0x...');
const allProposals = await sdk.proposal.getAll();
```

### Market Operations

```typescript
// Get swap quote
const quote = await sdk.market.getQuote({
  daoId: '0x...',
  amountIn: 1_000_000n,
  assetToStable: true,
});

console.log('Expected output:', quote.amountOut);
console.log('Price impact:', quote.priceImpact, '%');

// Execute swap (asset → stable)
const swapTx = await sdk.market.swapAssetForStable({
  daoId: '0x...',
  amountIn: 1_000_000n,
  minAmountOut: quote.amountOut * 99n / 100n, // 1% slippage
  coinId: '0x...',
});

// Get current price
const price = await sdk.market.getPrice('0x...');

// Liquidity operations
const pool = await sdk.market.pool.get('0x...');
const reserves = await sdk.market.pool.getReserves(pool.id);
```

### DAO Operations

```typescript
// Get DAO info
const daoInfo = await sdk.dao.getInfo('0x...');
const daoConfig = await sdk.dao.getConfig('0x...');

// List all DAOs
const allDaos = await sdk.getDaos();

// Vault operations
const balance = await sdk.dao.vault.getBalance('0x...', 'treasury', '0x2::sui::SUI');
```

## Examples

Working examples in [`scripts/`](./scripts/). Run them in order to test the full protocol lifecycle.

### 1. Launchpad E2E (`launchpad-e2e.ts`)

**Creates a new DAO via token launch.** This is the starting point - it deploys test coins, creates a raise, stages success/failure actions, and finalizes into a DAO with a spot pool.

```bash
pnpm test:launchpad
```

**What it does:**
1. Deploys test asset, stable, and LP coins
2. Creates a raise with configurable min/max amounts
3. Stages two-outcome actions (success: create pool, failure: refund)
4. Simulates contributions
5. Completes the raise and executes success/failure actions
6. Outputs DAO info to `deployments/test-data/test-dao-info.json`

**Modes:**
- Interactive (default): Prompts for configuration
- `--non-interactive`: Uses defaults without prompts

### 2. Deploy Conditional Coins (`deploy-conditional-coins.ts`)

**Deploys fresh conditional coins for a new proposal.** Each proposal requires its own set of conditional coins - they cannot be reused between proposals.

```bash
pnpm deploy:conditional-coins
```

**What it does:**
1. Reads DAO info from `deployments/test-data/test-dao-info.json`
2. Deploys conditional asset and stable coins for each outcome
3. Outputs coin info to `deployments/test-data/test-proposal-coins.json`

**Prerequisites:** Run `launchpad-e2e.ts` first

### 3. Proposal E2E with Swaps (`proposal-e2e-with-swaps.ts`)

**Creates and executes a governance proposal with trading.** Requires a DAO created by `launchpad-e2e.ts` and fresh conditional coins.

```bash
pnpm test:proposal-with-swaps
```

**What it does:**
1. Creates a proposal with staged actions
2. Advances through phases: PREMARKET → REVIEW → TRADING
3. Performs conditional swaps to influence TWAP
4. Waits for trading period to end
5. Finalizes proposal (winner determined by TWAP)
6. Executes actions if Accept wins
7. Redeems winning conditional tokens

**Prerequisites:** Run `launchpad-e2e.ts` first, then `deploy-conditional-coins.ts`

### 4. Proposal E2E with Balance Swaps (`proposal-e2e-balance-swaps.ts`)

**Alternative proposal flow using balance-based conditional swaps.** Same as above but uses the lower-level `ConditionalBalance` API for swaps.

```bash
pnpm test:proposal-balance-swaps
```

**Prerequisites:** Run `launchpad-e2e.ts` first, then `deploy-conditional-coins.ts`

### Recommended Order

```bash
# 1. Create a DAO via launchpad
pnpm test:launchpad

# 2. Deploy conditional coins for the proposal
pnpm deploy:conditional-coins

# 3. Run a proposal on that DAO (choose one)
pnpm test:proposal-with-swaps
# OR
pnpm test:proposal-balance-swaps

# For subsequent proposals, redeploy conditional coins first:
pnpm deploy:conditional-coins
pnpm test:proposal-with-swaps
```

> **Note:** Conditional coins are consumed during proposal finalization. You must deploy new conditional coins before each proposal.

## Development

```bash
pnpm install      # Install dependencies
pnpm build        # Build
pnpm dev          # Watch mode
pnpm clean        # Clean builds
pnpm type-check   # Type check
pnpm generate-docs # generate SDK structure
```

## License

MIT
