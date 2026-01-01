/**
 * Workflows - High-level orchestrators for complex multi-step operations
 *
 * This module provides user-friendly APIs that hide all the complexity
 * of package IDs, type arguments, witnesses, and PTB construction.
 *
 * @module workflows
 */

// Types
export * from './types';

// Intent execution
export {
  IntentExecutor,
  // NOTE: MetadataKeyTypes removed - CoinMetadata no longer stored in Account
  type IntentExecutorPackages,
} from './intent-executor';

// Action conversion (backend → SDK format)
export {
  parsedActionToExecutionConfig,
  parsedActionsToExecutionConfigs,
  validateAndConvertActions,
  ActionConversionError,
  type ParsedAction,
} from './action-converter';

// Auto executor (fetches from backend, builds PTB)
export {
  AutoExecutor,
  createAutoExecutor,
  type AutoExecutorConfig,
  type BackendRaiseResponse,
  type BackendProposalResponse,
  type BackendDaoResponse,
} from './auto-executor';

// Launchpad workflow
export {
  LaunchpadWorkflow,
  type LaunchpadWorkflowPackages,
  type LaunchpadWorkflowSharedObjects,
} from './launchpad-workflow';

// Proposal workflow
export {
  ProposalWorkflow,
  type ProposalWorkflowPackages,
  type ProposalWorkflowSharedObjects,
} from './proposal-workflow';
