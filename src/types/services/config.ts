/**
 * SDK Configuration Types
 *
 * Types for SDK initialization and configuration.
 * Note: NetworkType is defined in config/ module.
 * Note: PackageDeployment and DeploymentConfig are in types/deployment.ts
 *
 * @module types/services/config
 */

import type { DeploymentConfig } from '../deployment';

/**
 * SDK initialization configuration
 */
export interface SDKConfig {
  /** Network type or custom RPC URL */
  network: string;
  /** Deployment configuration */
  deployments: DeploymentConfig;
  /** Optional custom SuiClient options */
  clientOptions?: {
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Custom headers */
    headers?: Record<string, string>;
  };
}
