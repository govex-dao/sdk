# Futarchy SDK

TypeScript SDK for the Govex Futarchy Protocol on Sui.

## Installation

```bash
npm install @govex/futarchy-sdk
```

## Quick Start

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

// Using default public fullnode
const sdk = new FutarchySDK({ network: 'mainnet' });

// Using custom RPC (recommended for production)
const sdk = new FutarchySDK({
  network: 'mainnet',
  rpcUrl: 'https://your-endpoint.sui-mainnet.quiknode.pro',
});

// Access services
const daoInfo = await sdk.dao.getInfo(daoId);
const raiseInfo = await sdk.launchpad.getRaise(raiseId);
```

## Configuration

| Option | Description | Required |
|--------|-------------|----------|
| `network` | Network name: `mainnet`, `testnet`, `devnet`, `localnet` | Yes |
| `rpcUrl` | Custom RPC URL (overrides default fullnode) | Recommended for production |
| `deployments` | Custom deployment config | No (uses bundled) |

> **Note:** For production use, set `rpcUrl` to avoid rate limits on public fullnodes.

## Core Concepts

- **Futarchy**: Governance via prediction markets - proposals decided by PASS vs REJECT prices
- **Launchpad**: Token launches with staged success/failure actions
- **Proposals**: Create governance proposals with conditional outcomes
- **Intent Execution**: 3-layer pattern for atomic action execution

## Services

| Service | Description |
|---------|-------------|
| `sdk.dao` | DAO queries, vault, oracle operations |
| `sdk.launchpad` | Token launch lifecycle |
| `sdk.proposal` | Proposal creation, trading, finalization |
| `sdk.market` | AMM swaps and pool operations |
| `sdk.admin` | Protocol administration |

## Documentation

See [docs/FULL_DOCUMENTATION.md](docs/FULL_DOCUMENTATION.md) for comprehensive documentation including:

- Directory structure
- All service methods
- Workflow patterns
- Action system (60+ action types)
- Transaction building
- Type definitions

## License

MIT
