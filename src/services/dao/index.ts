/**
 * DAOService - DAO information & management
 *
 * Provides simple, user-friendly API for DAO account operations.
 *
 * Sub-namespaces:
 * - oracle: Oracle grant operations
 *
 * @module services/dao
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { BaseTransactionBuilder, TransactionUtils } from '../utils';
import { getCurrentVersionWitness, getObjectType } from '@/utils';
import {
  Packages,
  SharedObjects,
  DAOConfigInfo,
  DAOInfo,
  CreateDAOConfig,
  InitActionSpec,
  SDKConfigWithObjects,
} from '@/types';
import { DAOOracle } from './oracle';
import { VaultOperations } from './vault';

// Re-export sub-namespaces
export { DAOOracle } from './oracle';

/**
 * Lightweight helper to fetch DAO type information
 */
export class DAOInfoHelper {
  constructor(private client: SuiClient) {}

  async getInfo(daoId: string): Promise<DAOInfo> {
    const daoObject = await this.client.getObject({
      id: daoId,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (!daoObject.data?.content || daoObject.data.content.dataType !== 'moveObject') {
      throw new Error(`DAO not found: ${daoId}`);
    }

    const type = daoObject.data.type;
    if (!type) {
      throw new Error(`Could not determine DAO type for: ${daoId}`);
    }

    const typeMatch = type.match(/<.*?<(.+?),\s*(.+?)>>/);
    if (!typeMatch) {
      throw new Error(`Could not parse DAO type parameters from: ${type}`);
    }

    const assetType = typeMatch[1].trim();
    const stableType = typeMatch[2].trim();

    const fields = (daoObject.data.content as any).fields;
    const configFields = fields?.config?.fields;

    if (!configFields?.spot_pool_id) {
      throw new Error(`DAO does not have spot pool configured: ${daoId}`);
    }

    // Extract lpType from config or derive from spot pool type
    const lpType = configFields?.lp_type || '';

    return {
      id: daoId,
      assetType,
      stableType,
      lpType,
      spotPoolId: configFields.spot_pool_id,
    };
  }
}

export class DAOService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;

  // Sub-namespaces
  public readonly oracle: DAOOracle;
  public readonly vault: VaultOperations;

  constructor({client, packages, sharedObjects}: SDKConfigWithObjects) {
    this.client = client;
    this.packages = packages;
    this.sharedObjects = sharedObjects;

    // Initialize sub-namespaces
    this.oracle = new DAOOracle({
      client,
      futarchyGovernancePackageId: packages.futarchyGovernanceActions,
    });

    this.vault = new VaultOperations({
      client,
      packages,
      sharedObjects
    });
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get DAO information (lightweight)
   */
  async getInfo(daoId: string): Promise<DAOInfo> {
    const helper = new DAOInfoHelper(this.client);
    return helper.getInfo(daoId);
  }

  /**
   * Get DAO configuration (full details)
   */
  async getConfig(daoId: string): Promise<DAOConfigInfo> {
    const obj = await this.client.getObject({
      id: daoId,
      options: { showContent: true, showType: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`DAO not found: ${daoId}`);
    }

    const type = obj.data.type;
    let assetType = '';
    let stableType = '';
    if (type) {
      const typeMatch = type.match(/<.*?<(.+?),\s*(.+?)>>/);
      if (typeMatch) {
        assetType = typeMatch[1].trim();
        stableType = typeMatch[2].trim();
      }
    }

    const fields = obj.data.content.fields as any;
    const metadata = fields.metadata?.fields || {};
    const config = fields.config?.fields || {};

    return {
      id: daoId,
      name: metadata.name || '',
      description: metadata.description || '',
      iconUrl: metadata.icon_url || '',
      assetType,
      stableType,
      spotPoolId: config.spot_pool_id || '',
      tradingPeriodMs: Number(config.trading_period_ms || 0),
      reviewPeriodMs: Number(config.review_period_ms || 0),
      proposalsEnabled: config.proposals_enabled !== false,
    };
  }

  /**
   * Get proposals for a DAO
   */
  async getProposals(daoId: string): Promise<string[]> {
    // Query dynamic fields for proposals
    const dynamicFields = await this.client.getDynamicFields({
      parentId: daoId,
    });

    const proposalIds: string[] = [];
    for (const field of dynamicFields.data) {
      if (field.objectType?.includes('Proposal')) {
        proposalIds.push(field.objectId);
      }
    }

    return proposalIds;
  }

  /**
   * Get all DAOs from factory events
   */
  async getAll(factoryPackageId: string): Promise<any[]> {
    const eventType = `${factoryPackageId}::factory::DAOCreated`;
    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });
    return response.data.map((event) => event.parsedJson);
  }

  /**
   * Get DAOs created by a specific address
   */
  async getByCreator(factoryPackageId: string, creator: string): Promise<any[]> {
    const allDAOs = await this.getAll(factoryPackageId);
    return allDAOs.filter((dao: any) => dao.creator === creator);
  }

  /**
   * Get DAO created event by account ID
   * Useful because asset_type and stable_type are stored in the event, not the object
   */
  async getEvent(factoryPackageId: string, accountId: string): Promise<{
    account_id: string;
    dao_name: string;
    asset_type: string;
    stable_type: string;
    creator: string;
    affiliate_id: string;
    timestamp: number;
  } | null> {
    const allDAOs = await this.getAll(factoryPackageId);
    return allDAOs.find((dao: any) => dao.account_id === accountId) || null;
  }

  /**
   * Get managed objects for a DAO
   */
  async getManagedObjects(daoId: string): Promise<{ name: string; objectId: string; type: string }[]> {
    const dynamicFields = await this.client.getDynamicFields({
      parentId: daoId,
    });

    const managedObjects: { name: string; objectId: string; type: string }[] = [];

    for (const field of dynamicFields.data) {
      // Check if this is a managed object (has String key)
      if (field.name?.type === '0x1::string::String') {
        managedObjects.push({
          name: field.name.value as string,
          objectId: field.objectId,
          type: field.objectType || 'unknown',
        });
      }
    }

    return managedObjects;
  }

  /**
   * Add a managed object to the DAO
   */
  async addManagedObject(config: {
    daoId: string;
    name: string;
    objectId: string;
  }): Promise<Transaction> {
    const objectType = await getObjectType(this.client, config.objectId);

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    const versionWitness = getCurrentVersionWitness(tx, this.packages.futarchyCore);

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(config.name)))],
    });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'add_managed_asset'
      ),
      typeArguments: ['0x1::string::String', objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        key,
        tx.object(config.objectId),
        versionWitness,
      ],
    });

    return tx;
  }

  /**
   * Remove a managed object from the DAO
   */
  removeManagedObject(config: {
    daoId: string;
    name: string;
    objectType: string;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    const versionWitness = getCurrentVersionWitness(tx, this.packages.futarchyCore);

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(config.name)))],
    });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'remove_managed_asset'
      ),
      typeArguments: ['0x1::string::String', config.objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        key,
        versionWitness,
      ],
    });

    return tx;
  }

  /**
   * Borrow a managed object (read-only reference)
   */
  borrowManagedObject(config: {
    daoId: string;
    name: string;
    objectType: string;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    const versionWitness = getCurrentVersionWitness(tx, this.packages.futarchyCore);

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(config.name)))],
    });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'borrow_managed_asset'
      ),
      typeArguments: ['0x1::string::String', config.objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        key,
        versionWitness,
      ],
    });

    return tx;
  }

  /**
   * Check if a managed object exists
   */
  async hasManagedObject(daoId: string, name: string): Promise<boolean> {
    const tx = new Transaction();

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(name)))],
    });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'has_managed_data'
      ),
      typeArguments: ['0x1::string::String'],
      arguments: [
        tx.object(daoId),
        key,
      ],
    });

    try {
      const result = await this.client.devInspectTransactionBlock({
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: tx,
      });

      if (result.results && result.results[0]?.returnValues) {
        return result.results[0].returnValues[0][0][0] === 1;
      }
    } catch {
      // Ignore errors
    }

    return false;
  }

  // ============================================================================
  // OBJECT DEPOSITS (keep/receive pattern)
  // ============================================================================

  /**
   * Deposit an object to the DAO account
   */
  async depositObject(config: {
    daoId: string;
    objectId: string;
  }): Promise<Transaction> {
    const objectType = await getObjectType(this.client, config.objectId);

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'keep'
      ),
      typeArguments: [objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(config.objectId),
      ],
    });

    return tx;
  }

  /**
   * Withdraw an object from the DAO account
   */
  async withdrawObject(config: {
    daoId: string;
    objectId: string;
    recipient: string;
  }): Promise<Transaction> {
    const objectType = await getObjectType(this.client, config.objectId);

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    const versionWitness = getCurrentVersionWitness(tx, this.packages.futarchyCore);

    const received = tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'receive'
      ),
      typeArguments: [objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.receivingRef({
          objectId: config.objectId,
          version: '0',
          digest: '',
        }),
        versionWitness,
      ],
    });

    tx.transferObjects([received], config.recipient);

    return tx;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Configure object deposit settings for the DAO
   */
  configureDeposits(config: {
    daoId: string;
    enabled: boolean;
    maxObjects?: number;
    resetCounter?: boolean;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'configure_object_deposits'
      ),
      typeArguments: [`${this.packages.futarchyCore}::futarchy_config::FutarchyConfig`],
      arguments: [
        tx.object(config.daoId),
        tx.pure.bool(config.enabled),
        tx.pure.option('u128', config.maxObjects ? BigInt(config.maxObjects) : null),
        tx.pure.bool(config.resetCounter ?? false),
      ],
    });

    return tx;
  }

  /**
   * Add a type to the DAO's whitelist
   */
  addToWhitelist(config: {
    daoId: string;
    typeToWhitelist: string;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'manage_type_whitelist'
      ),
      typeArguments: [
        `${this.packages.futarchyCore}::futarchy_config::FutarchyConfig`,
        config.typeToWhitelist,
      ],
      arguments: [
        tx.object(config.daoId),
        tx.pure.bool(true),
      ],
    });

    return tx;
  }

  /**
   * Remove a type from the DAO's whitelist
   */
  removeFromWhitelist(config: {
    daoId: string;
    typeToRemove: string;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.accountProtocol,
        'account',
        'manage_type_whitelist'
      ),
      typeArguments: [
        `${this.packages.futarchyCore}::futarchy_config::FutarchyConfig`,
        config.typeToRemove,
      ],
      arguments: [
        tx.object(config.daoId),
        tx.pure.bool(false),
      ],
    });

    return tx;
  }

  /**
   * Get the object tracker state
   */
  async getObjectTrackerState(daoId: string): Promise<{
    depositsEnabled: boolean;
    currentCount: number;
    maxObjects: number;
  }> {
    const obj = await this.client.getObject({
      id: daoId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`DAO not found: ${daoId}`);
    }

    const fields = obj.data.content.fields as any;
    const tracker = fields.object_tracker?.fields || {};

    return {
      depositsEnabled: tracker.deposits_enabled !== false,
      currentCount: Number(tracker.current_count || 0),
      maxObjects: Number(tracker.max_objects || 0),
    };
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  /**
   * Clean up expired intents
   */
  cleanupExpiredIntents(
    daoAccountId: string,
    maxToClean: number = 20,
    clockId?: string
  ): Transaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyGovernanceActions}::intent_janitor::cleanup_expired_futarchy_intents`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.pure.u64(Math.min(maxToClean, 20)),
        tx.object(clock),
      ],
    });

    return tx;
  }

  /**
   * Check if DAO maintenance is needed
   */
  checkMaintenanceNeeded(daoAccountId: string, clockId?: string): Transaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyGovernanceActions}::intent_janitor::check_maintenance_needed`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.object(clock),
      ],
    });

    return tx;
  }

  // ============================================================================
  // FACTORY OPERATIONS
  // ============================================================================

  /**
   * Create a new DAO
   *
   * @param config - DAO creation configuration
   * @returns Transaction to create the DAO
   */
  create(config: CreateDAOConfig): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();
    const clockId = config.clockId || '0x6';

    // Split payment from gas
    const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.paymentAmount)]);

    // Create SignedU128 for TWAP threshold
    const thresholdValue = config.twapThresholdNegative
      ? tx.moveCall({
          target: `${this.packages.futarchyTypes}::signed::neg_from`,
          arguments: [tx.pure.u128(config.twapThreshold)],
        })
      : tx.moveCall({
          target: `${this.packages.futarchyTypes}::signed::from_u128`,
          arguments: [tx.pure.u128(config.twapThreshold)],
        });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.futarchyFactory,
        'factory',
        'create_dao'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        // factory (mutable)
        tx.sharedObjectRef({
          objectId: this.sharedObjects.factory.id,
          initialSharedVersion: this.sharedObjects.factory.version,
          mutable: true,
        }),
        // registry
        tx.object(this.sharedObjects.packageRegistry.id),
        // fee_manager (mutable)
        tx.sharedObjectRef({
          objectId: this.sharedObjects.feeManager.id,
          initialSharedVersion: this.sharedObjects.feeManager.version,
          mutable: true,
        }),
        // payment
        paymentCoin,
        // affiliate_id
        tx.pure.string(config.affiliateId || ''),
        // min_asset_amount
        tx.pure.u64(config.minAssetAmount),
        // min_stable_amount
        tx.pure.u64(config.minStableAmount),
        // dao_name
        tx.pure.string(config.daoName),
        // icon_url_string
        tx.pure.string(config.iconUrl),
        // review_period_ms
        tx.pure.u64(config.reviewPeriodMs),
        // trading_period_ms
        tx.pure.u64(config.tradingPeriodMs),
        // twap_start_delay
        tx.pure.u64(config.twapStartDelay),
        // twap_step_max
        tx.pure.u64(config.twapStepMax),
        // twap_initial_observation
        tx.pure.u128(config.twapInitialObservation),
        // twap_threshold (SignedU128)
        thresholdValue,
        // amm_total_fee_bps
        tx.pure.u64(config.ammTotalFeeBps),
        // description
        tx.pure.string(config.description),
        // max_outcomes
        tx.pure.u64(config.maxOutcomes),
        // agreement_lines
        tx.pure.vector('string', config.agreementLines || []),
        // agreement_difficulties
        tx.pure.vector('u64', config.agreementDifficulties || []),
        // treasury_cap
        tx.object(config.treasuryCap),
        // coin_metadata
        tx.object(config.coinMetadata),
        // clock
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Create a new DAO with initialization action specs
   *
   * @param config - DAO creation configuration
   * @param initSpecs - Array of initialization action specifications
   * @returns Transaction to create the DAO with init specs
   */
  createWithSpecs(config: CreateDAOConfig, initSpecs: InitActionSpec[]): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();
    const clockId = config.clockId || '0x6';

    // Split payment from gas
    const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.paymentAmount)]);

    // Create SignedU128 for TWAP threshold
    const thresholdValue = config.twapThresholdNegative
      ? tx.moveCall({
          target: `${this.packages.futarchyTypes}::signed::neg_from`,
          arguments: [tx.pure.u128(config.twapThreshold)],
        })
      : tx.moveCall({
          target: `${this.packages.futarchyTypes}::signed::from_u128`,
          arguments: [tx.pure.u128(config.twapThreshold)],
        });

    // Build ActionSpec vector for Move
    const actionSpecElements = initSpecs.map(spec => {
      return tx.moveCall({
        target: `${this.packages.futarchyTypes}::action_spec::new`,
        arguments: [
          tx.pure.string(spec.actionType),
          tx.pure.vector('u8', spec.actionData),
        ],
      });
    });

    // Create vector of ActionSpecs
    const specsVector = tx.makeMoveVec({
      type: `${this.packages.futarchyTypes}::action_spec::ActionSpec`,
      elements: actionSpecElements,
    });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.packages.futarchyFactory,
        'factory',
        'create_dao_with_specs'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        // factory (mutable)
        tx.sharedObjectRef({
          objectId: this.sharedObjects.factory.id,
          initialSharedVersion: this.sharedObjects.factory.version,
          mutable: true,
        }),
        // registry
        tx.object(this.sharedObjects.packageRegistry.id),
        // fee_manager (mutable)
        tx.sharedObjectRef({
          objectId: this.sharedObjects.feeManager.id,
          initialSharedVersion: this.sharedObjects.feeManager.version,
          mutable: true,
        }),
        // payment
        paymentCoin,
        // affiliate_id
        tx.pure.string(config.affiliateId || ''),
        // min_asset_amount
        tx.pure.u64(config.minAssetAmount),
        // min_stable_amount
        tx.pure.u64(config.minStableAmount),
        // dao_name
        tx.pure.string(config.daoName),
        // icon_url_string
        tx.pure.string(config.iconUrl),
        // review_period_ms
        tx.pure.u64(config.reviewPeriodMs),
        // trading_period_ms
        tx.pure.u64(config.tradingPeriodMs),
        // twap_start_delay
        tx.pure.u64(config.twapStartDelay),
        // twap_step_max
        tx.pure.u64(config.twapStepMax),
        // twap_initial_observation
        tx.pure.u128(config.twapInitialObservation),
        // twap_threshold (SignedU128)
        thresholdValue,
        // amm_total_fee_bps
        tx.pure.u64(config.ammTotalFeeBps),
        // description
        tx.pure.string(config.description),
        // max_outcomes
        tx.pure.u64(config.maxOutcomes),
        // agreement_lines
        tx.pure.vector('string', config.agreementLines || []),
        // agreement_difficulties
        tx.pure.vector('u64', config.agreementDifficulties || []),
        // treasury_cap
        tx.object(config.treasuryCap),
        // coin_metadata
        tx.object(config.coinMetadata),
        // init_specs
        specsVector,
        // clock
        tx.object(clockId),
      ],
    });

    return tx;
  }
}