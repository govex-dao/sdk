/**
 * Action Converter - Converts parsed actions from backend to SDK execution configs
 *
 * This module bridges the gap between:
 * - Backend parser output (ParsedAction from indexer)
 * - SDK executor input (IntentActionConfig)
 *
 * Uses the shared ACTION_REGISTRY as single source of truth.
 *
 * @module workflows/action-converter
 */

import type { IntentActionConfig } from './types/intent';
import { ACTION_BY_SDK_ID, type ActionDefinition } from '../shared/action-registry';

/**
 * Parsed action from backend indexer
 * Matches the output of backend/indexer-v2/action-parser.ts
 */
export interface ParsedAction {
  /** Action type identifier (e.g., "create_stream", "mint") */
  type: string;

  /** Full Move type path (e.g., "0x123::stream_init_actions::CreateStream") */
  fullType: string;

  /** Whether this is a known action with full parsing */
  isKnown: boolean;

  /** Whether this action was staged (add_*_spec) or executed (do_*) */
  phase: 'staged' | 'executed';

  /** Coin/asset type if applicable */
  coinType?: string;

  /** Additional type arguments */
  typeArgs?: string[];

  /** Parsed parameters (human-readable for known actions) */
  params: Record<string, any>;

  /** Raw argument bytes for unknown actions */
  rawArgs?: any[];
}

/**
 * Error thrown when an action cannot be converted
 */
export class ActionConversionError extends Error {
  constructor(
    public actionType: string,
    public reason: string
  ) {
    super(`Cannot convert action '${actionType}': ${reason}`);
    this.name = 'ActionConversionError';
  }
}

/**
 * Get required param from parsed action
 */
function getRequiredParam<T>(action: ParsedAction, key: string): T {
  const value = action.params[key];
  if (value === undefined || value === null) {
    throw new ActionConversionError(action.type, `missing required param '${key}'`);
  }
  return value as T;
}

/**
 * Build IntentActionConfig from action definition and parsed params
 * Uses the staging.params to know what fields are needed
 */
function buildConfig(def: ActionDefinition, action: ParsedAction): IntentActionConfig {
  const { sdkId } = def;
  const { params, typeArgs } = action;

  // Analyze what type params this action needs from the staging definition
  const stagingParams = def.staging.params;
  const needsCoinType = stagingParams.some(p => p.name === 'coinType');
  const needsObjectType = stagingParams.some(p => p.name === 'objectType');
  const needsCapType = stagingParams.some(p => p.name === 'capType');
  const needsAssetType = stagingParams.some(p => p.name === 'assetType');
  const needsStableType = stagingParams.some(p => p.name === 'stableType');
  const needsLpType = stagingParams.some(p => p.name === 'lpType');
  const needsKeyType = stagingParams.some(p => p.name === 'keyType');

  // Build config based on what's needed
  const config: Record<string, any> = { action: sdkId };

  if (needsCoinType) {
    // coinType can come from params.coinType, action.coinType, or typeArgs[0]
    config.coinType = params.coinType || action.coinType || typeArgs?.[0];
    if (!config.coinType) {
      throw new ActionConversionError(sdkId, 'coinType not found');
    }
  }

  if (needsObjectType) {
    config.objectType = params.objectType || typeArgs?.[0] || '';
  }

  if (needsCapType) {
    config.capType = params.capType || typeArgs?.[0] || '';
  }

  if (needsAssetType) {
    config.assetType = params.assetType || typeArgs?.[0] || '';
  }

  if (needsStableType) {
    config.stableType = params.stableType || typeArgs?.[1] || '';
  }

  if (needsLpType) {
    config.lpType = params.lpType || typeArgs?.[2] || '';
  }

  if (needsKeyType) {
    config.keyType = params.keyType || typeArgs?.[1] || '';
    if (!config.keyType) {
      throw new ActionConversionError(sdkId, 'keyType not found');
    }
  }

  // Special case: create_pool_with_mint needs extra required params
  if (sdkId === 'create_pool_with_mint') {
    config.lpTreasuryCapId = getRequiredParam<string>(action, 'lpTreasuryCapId');
    config.lpMetadataId = getRequiredParam<string>(action, 'lpMetadataId');
  }

  return config as IntentActionConfig;
}

/**
 * Convert a single parsed action to SDK execution config
 *
 * @param action - Parsed action from backend
 * @returns IntentActionConfig for SDK executor
 * @throws ActionConversionError if action cannot be converted
 */
export function parsedActionToExecutionConfig(action: ParsedAction): IntentActionConfig {
  const { type, isKnown } = action;

  // Warn if action wasn't fully parsed
  if (!isKnown) {
    throw new ActionConversionError(type, 'action was not fully parsed by backend (isKnown=false)');
  }

  // Look up action in registry
  const def = ACTION_BY_SDK_ID.get(type);
  if (!def) {
    throw new ActionConversionError(type, 'unknown action type - not in ACTION_REGISTRY');
  }

  return buildConfig(def, action);
}

/**
 * Convert an array of parsed actions to SDK execution configs
 *
 * @param actions - Array of parsed actions from backend
 * @returns Array of IntentActionConfigs for SDK executor
 * @throws ActionConversionError if any action cannot be converted
 */
export function parsedActionsToExecutionConfigs(actions: ParsedAction[]): IntentActionConfig[] {
  return actions.map((action, index) => {
    try {
      return parsedActionToExecutionConfig(action);
    } catch (error) {
      if (error instanceof ActionConversionError) {
        throw new ActionConversionError(
          action.type,
          `at index ${index}: ${error.reason}`
        );
      }
      throw error;
    }
  });
}

/**
 * Validate that all actions in an array can be converted
 * Returns validation result instead of throwing
 *
 * @param actions - Array of parsed actions
 * @returns Validation result with converted configs or errors
 */
export function validateAndConvertActions(actions: ParsedAction[]): {
  success: boolean;
  configs?: IntentActionConfig[];
  errors?: Array<{ index: number; type: string; error: string }>;
} {
  const configs: IntentActionConfig[] = [];
  const errors: Array<{ index: number; type: string; error: string }> = [];

  for (let i = 0; i < actions.length; i++) {
    try {
      configs.push(parsedActionToExecutionConfig(actions[i]));
    } catch (error) {
      errors.push({
        index: i,
        type: actions[i].type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, configs };
}
