/**
 * Service Package Types - Package ID configurations for services
 *
 * @module types/services/packages
 */

/**
 * Base package IDs required for intent execution
 */
export interface IntentExecutorPackages {
  accountActionsPackageId: string;
  accountProtocolPackageId: string;
  futarchyCorePackageId: string;
  futarchyActionsPackageId: string;
  futarchyFactoryPackageId: string;
  futarchyGovernancePackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyOracleActionsPackageId: string;
  packageRegistryId: string;
}

/**
 * Package IDs required for launchpad workflow
 */
export interface LaunchpadWorkflowPackages extends IntentExecutorPackages {
  futarchyTypesPackageId: string;
  oneShotUtilsPackageId?: string;
}

/**
 * Package IDs required for proposal workflow
 */
export interface ProposalWorkflowPackages extends IntentExecutorPackages {
  futarchyTypesPackageId: string;
  futarchyMarketsCorePackageId: string;
  futarchyMarketsPrimitivesPackageId: string;
  futarchyMarketsOperationsPackageId: string;
  futarchyGovernanceActionsPackageId: string;
  oneShotUtilsPackageId?: string;
}

/**
 * Shared object references for launchpad workflow
 */
export interface LaunchpadWorkflowSharedObjects {
  factoryId: string;
  factorySharedVersion: number;
  packageRegistryId: string;
  packageRegistrySharedVersion: number;
  feeManagerId: string;
  feeManagerSharedVersion: number;
}

/**
 * Shared object references for proposal workflow
 */
export interface ProposalWorkflowSharedObjects {
  packageRegistryId: string;
  packageRegistrySharedVersion: number;
}

/**
 * Package IDs for TransactionComposer
 */
export interface TransactionComposerPackages {
  accountActionsPackageId: string;
  futarchyActionsPackageId: string;
  futarchyTypesPackageId: string;
  futarchyFactoryPackageId: string;
  /** Required only for stageToProposal */
  futarchyMarketsCorePackageId?: string;
}

/**
 * Shared object references for TransactionComposer
 */
export interface TransactionComposerSharedObjects {
  packageRegistryId: string;
}
