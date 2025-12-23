/**
 * Network Detection Utilities for E2E Tests
 *
 * Provides network detection and RPC URL handling.
 */

/**
 * Supported network types
 */
export type NetworkType = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

/**
 * Check if a network string represents localnet
 */
export function isLocalnet(network: string): boolean {
  return network === 'localnet';
}

/**
 * Check if a network string represents devnet
 */
export function isDevnet(network: string): boolean {
  return network === 'devnet';
}

/**
 * Check if a network string represents testnet
 */
export function isTestnet(network: string): boolean {
  return network === 'testnet';
}

/**
 * Check if a network string represents mainnet
 */
export function isMainnet(network: string): boolean {
  return network === 'mainnet';
}

/**
 * Get the default RPC URL for a network
 */
export function getDefaultRpcUrl(network: string): string {
  switch (network) {
    case 'localnet':
      return 'http://127.0.0.1:9000';
    case 'devnet':
      return 'https://fullnode.devnet.sui.io:443';
    case 'testnet':
      return 'https://fullnode.testnet.sui.io:443';
    case 'mainnet':
      return 'https://fullnode.mainnet.sui.io:443';
    default:
      return 'https://fullnode.devnet.sui.io:443';
  }
}

/**
 * Get network from environment variable with fallback
 */
export function getNetworkFromEnv(defaultNetwork: NetworkType = 'localnet'): string {
  return process.env.NETWORK || defaultNetwork;
}

/**
 * Get RPC URL from environment or default for network
 */
export function getRpcUrl(network?: string): string {
  if (process.env.RPC_URL) {
    return process.env.RPC_URL;
  }
  const effectiveNetwork = network || getNetworkFromEnv();
  return getDefaultRpcUrl(effectiveNetwork);
}

/**
 * Detect network from RPC URL
 */
export function detectNetworkFromRpc(rpcUrl: string): NetworkType {
  if (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')) {
    return 'localnet';
  }
  if (rpcUrl.includes('devnet')) {
    return 'devnet';
  }
  if (rpcUrl.includes('testnet')) {
    return 'testnet';
  }
  if (rpcUrl.includes('mainnet')) {
    return 'mainnet';
  }
  // Default to devnet for unknown URLs
  return 'devnet';
}
