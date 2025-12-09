/**
 * Intents - Action staging, execution, and queries for governance proposals
 *
 * @module intents
 */

import { IntentExecutor } from './intent-executor';
import { ActionComposer } from './action-composer';
import { OracleQueries, VaultQueries } from './query';
import { SDKConfigWithObjects } from '@/types';
import { StagingActions } from '@/protocol/intents/staging';
import { ExecutionActions } from '@/protocol/intents/execution';

/**
 * IntentService - Unified interface for intent operations
 *
 * This service encapsulates all intent-related operations including:
 * - Intent execution (launchpad and proposal)
 * - Transaction composition
 * - Oracle queries
 * - Vault queries
 *
 * Static utility classes for staging and execution are re-exported directly
 * and should be used as static methods (e.g., `Vault.deposit(...)`, `DAOConfigActions.newUpdateName(...)`).
 *
 * @example
 * ```typescript
 * const intentService = new IntentService({
 *   client,
 *   packages,
 *   sharedObjects,
 * });
 *
 * // Execute launchpad intent
 * const tx = intentService.executor.execute({
 *   intentType: 'launchpad',
 *   accountId: '0x...',
 *   raiseId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   actions: [
 *     { action: 'create_stream', coinType: stableType },
 *   ],
 * });
 *
 * // Build composed transactions
 * const composedTx = intentService.composer
 *   .new()
 *   .addStream({ ... })
 *   .stageToLaunchpad(raiseId, creatorCapId, assetType, stableType, 'success')
 *   .build();
 *
 * // Query oracle grants
 * const amount = await intentService.oracleQueries.getTotalAmount(grantId);
 *
 * // Query vault streams
 * const stream = await intentService.vaultQueries.getStream(streamId);
 * ```
 */
export class IntentService {
    /** Intent executor for executing staged actions */
    public readonly executor: IntentExecutor;

    /** Transaction composer for building complex PTBs */
    public readonly composer: ActionComposer;

    /** Oracle query operations */
    public readonly oracleQueries: OracleQueries;

    /** Vault query operations */
    public readonly vaultQueries: VaultQueries;

    public readonly staging: StagingActions;
    public readonly execution: ExecutionActions;

    constructor({client, packages, sharedObjects}: SDKConfigWithObjects) {
        this.executor = new IntentExecutor({client, packages, sharedObjects});
        this.composer = new ActionComposer(packages, sharedObjects);

        this.staging = new StagingActions();
        this.execution = new ExecutionActions();

        // Initialize query services
        this.oracleQueries = new OracleQueries(
            client,
            packages.futarchyOracleActions,
            sharedObjects.packageRegistry.id
        );

        this.vaultQueries = new VaultQueries({
            client,
            accountActionsPackageId: packages.accountActions,
        });
    }
}
