# Futarchy SDK

TypeScript SDK for the Govex Futarchy Protocol on Sui.

## Installation

```bash
npm install @govex/futarchy-sdk
```

## Quick Start

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({ network: 'mainnet' });

// Query DAOs
const daos = await sdk.getDaos();

// Query proposals
const proposals = await sdk.getProposals();

// Access services
const daoInfo = await sdk.dao.getInfo(daoId);
const raiseInfo = await sdk.launchpad.getRaise(raiseId);
```

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
