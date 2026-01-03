/**
 * Action Converter - Converts parsed actions from backend to SDK execution configs
 *
 * This module bridges the gap between:
 * - Backend indexer output (IndexedAction from event-based parsing)
 * - SDK executor input (IntentActionConfig)
 *
 * Uses action-definitions.ts as single source of truth.
 *
 * @module workflows/action-converter
 */

import type { IntentActionConfig } from './types/intent';
import { ACTION_BY_ID, getActionByFullType, type ActionDefinition } from '../config/action-definitions';

/**
 * Indexed action from backend indexer (event-based format)
 * Matches the output of backend/indexer-v2/grpc-indexer.ts event handlers
 */
export interface IndexedAction {
  /** Position in the action batch (0-indexed) */
  index: number;
  /** Short action type (e.g., "CreateStreamAction", "CurrencyMint") */
  type: string;
  /** Full Move type path (e.g., "0x...::stream_init_actions::CreateStreamAction") */
  fullType: string;
  /** Package ID where the action is defined */
  packageId?: string;
  /** Coin/asset type if applicable (first type arg) */
  coinType?: string;
  /** Parameters with types, names, and values */
  params: Array<{ type: string; name: string; value: string }>;
}

/**
 * Legacy ParsedAction interface (PTB-based parsing)
 * @deprecated Use IndexedAction for event-based parsing
 */
export interface ParsedAction {
  /** Action type identifier (e.g., "create_stream", "mint") */
  type: string;

  /** Full Move type path (e.g., "0x123::stream_init_actions::CreateStream") */
  fullType: string;

  /** Whether this is a known action with full parsing */
  isKnown?: boolean;

  /** Whether this action was staged (add_*_spec) or executed (do_*) */
  phase?: 'staged' | 'executed';

  /** Coin/asset type if applicable */
  coinType?: string;

  /** Additional type arguments */
  typeArgs?: string[];

  /** Parsed parameters (human-readable for known actions) */
  params: Record<string, any> | Array<{ type: string; name: string; value: string }>;

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
 * Convert params array to Record for buildConfig
 */
function normalizeParams(params: Record<string, any> | Array<{ type: string; name: string; value: string }>): Record<string, any> {
  if (!Array.isArray(params)) {
    return params;
  }
  // Convert array format to object
  const result: Record<string, any> = {};
  for (const p of params) {
    // Convert snake_case to camelCase
    const key = p.name.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    result[key] = p.value === 'null' ? undefined : p.value;
  }
  return result;
}

/**
 * Extract type args from fullType string
 * e.g., "0x...::module::Type<A, B, C>" -> ["A", "B", "C"]
 */
function extractTypeArgs(fullType: string): string[] {
  const match = fullType.match(/<(.+)>$/);
  if (!match) return [];

  // Simple split - handles basic cases
  const inner = match[1];
  const args: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of inner) {
    if (char === '<') depth++;
    else if (char === '>') depth--;
    else if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());

  return args;
}

/**
 * Build IntentActionConfig from action definition and parsed params
 * Uses the action definition's params and typeParams to know what fields are needed
 */
function buildConfig(def: ActionDefinition, params: Record<string, any>, typeArgs: string[], coinType?: string): IntentActionConfig {
  const { id, typeParams } = def;

  // Build config with action ID
  const config: Record<string, any> = { action: id };

  // Check if this action needs type parameters
  if (typeParams && typeParams.length > 0) {
    // Map typeParams to typeArgs
    for (let i = 0; i < typeParams.length; i++) {
      const paramName = typeParams[i];
      const typeArg = typeArgs[i];

      if (paramName === 'CoinType') {
        config.coinType = params.coinType || coinType || typeArg;
        if (!config.coinType) {
          throw new ActionConversionError(id, 'coinType not found');
        }
      } else if (paramName === 'ObjectType') {
        config.objectType = params.objectType || typeArg || '';
      } else if (paramName === 'CapType') {
        config.capType = params.capType || typeArg || '';
      } else if (paramName === 'AssetType') {
        config.assetType = params.assetType || typeArg || '';
      } else if (paramName === 'StableType') {
        config.stableType = params.stableType || typeArg || '';
      } else if (paramName === 'LPType') {
        config.lpType = params.lpType || typeArg || '';
      } else if (paramName === 'KeyType') {
        config.keyType = params.keyType || typeArg || '';
      }
    }
  }

  // Special case: create_pool_with_mint needs extra required params
  if (id === 'create_pool_with_mint') {
    config.lpTreasuryCapId = params.lpTreasuryCapId;
    config.lpCurrencyId = params.lpCurrencyId;
    if (!config.lpTreasuryCapId || !config.lpCurrencyId) {
      throw new ActionConversionError(id, 'lpTreasuryCapId or lpCurrencyId not found');
    }
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
  const { type, fullType, isKnown, coinType } = action;

  // First try: lookup by fullType (works for event-based indexed actions)
  let def = getActionByFullType(fullType);

  // Fallback: lookup by action ID (for legacy format where type is the SDK ID)
  if (!def) {
    def = ACTION_BY_ID[type];
  }

  // If still not found and isKnown is explicitly false, give specific error
  if (!def && isKnown === false) {
    throw new ActionConversionError(type, 'action was not fully parsed by backend (isKnown=false)');
  }

  if (!def) {
    throw new ActionConversionError(type, `unknown action type - fullType '${fullType}' not in ACTION_BY_MARKER_TYPE`);
  }

  // Normalize params and extract typeArgs from fullType
  const normalizedParams = normalizeParams(action.params);
  const typeArgs = action.typeArgs || extractTypeArgs(fullType);

  return buildConfig(def, normalizedParams, typeArgs, coinType);
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
