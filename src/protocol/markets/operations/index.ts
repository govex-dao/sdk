/**
 * Futarchy Markets Operations
 *
 * High-level market operations for the Futarchy Protocol.
 *
 * Modules:
 * - No-Arb Guard: Arbitrage prevention
 * - Swap Entry: User-facing swaps with auto-arb
 * - Liquidity Interact: Liquidity and escrow management
 * - Arbitrage Entry: Quotes and arbitrage simulation
 * - Spot Conditional Quoter: Spot swap quoting
 *
 * @module markets-operations
 */

export { NoArbGuard } from './no-arb-guard';
export { SwapEntry } from './swap-entry';
export { LiquidityInteract } from './liquidity-interact';
export { ArbitrageEntry } from './arbitrage-entry';
export { SpotConditionalQuoter } from './spot-conditional-quoter';
