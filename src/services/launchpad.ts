/**
 * LaunchpadService - Token launches & raises
 *
 * Workflow:
 * 1. createRaise(config)     - Create a new raise (returns raiseId, creatorCapId)
 * 2. startRaise(config)      - Stage success/failure actions + lock intents
 * 3. contribute(config)      - Users contribute to the raise
 * 4. complete(config)        - Settle raise + create DAO (after raise period ends)
 * 5. executeActions(config)  - Execute the staged init actions on the new DAO
 * 6. claim(raiseId, ...)     - Users claim their tokens (or refunds if failed)
 *
 * Queries:
 * - getRaise(raiseId)
 * - getContributions(raiseId)
 * - getContributionsBy(contributor)
 * - getContributionBy(raiseId, contributor)
 * - isSettled(raiseId)
 * - getState(raiseId)
 * - getTotalRaised(raiseId)
 * - getTokenClaims(raiseId)
 * - getRefundClaims(raiseId)
 * - getStartTime(raiseId)
 *
 * @module services/launchpad
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import {
  CreateRaiseConfig,
  ContributeConfig,
  CompleteRaiseConfig,
  ExecuteLaunchpadActionsConfig,
  ActionConfig,
  Packages,
  SharedObjects,
  SDKConfigWithObjects,
} from '@/types';
import { IntentExecutor } from './intents/intent-executor';
import { ActionComposer } from './intents/action-composer';

/** Config for startRaise */
export interface StartRaiseConfig {
  raiseId: string;
  creatorCapId: string;
  assetType: string;
  stableType: string;
  successActions: ActionConfig[];
  failureActions: ActionConfig[];
  clockId?: string;
}

export class LaunchpadService {
  private packages: Packages;
  private sharedObjects: SharedObjects;
  private intentExecutor: IntentExecutor;
  private client: SuiClient;

  /** Unlimited cap constant for contribution tiers */
  static readonly UNLIMITED_CAP = 18446744073709551615n;

  constructor({client, packages, sharedObjects}: SDKConfigWithObjects) {
    this.client = client;
    this.packages = packages;
    this.sharedObjects = sharedObjects;
    this.intentExecutor = new IntentExecutor({client: this.client, packages: this.packages, sharedObjects: this.sharedObjects});
  }

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  /**
   * Create a new token raise
   */
  createRaise(config: CreateRaiseConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const futarchyFactoryPackageId = this.packages.futarchyFactory;
    const { factory, feeManager } = this.sharedObjects;

    // Split launchpad fee from gas
    const [launchpadFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.launchpadFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::create_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        // 1. factory (immutable)
        tx.sharedObjectRef({
          objectId: factory.id,
          initialSharedVersion: factory.version,
          mutable: false,
        }),
        // 2. fee_manager (mutable)
        tx.sharedObjectRef({
          objectId: feeManager.id,
          initialSharedVersion: feeManager.version,
          mutable: true,
        }),
        // 3. treasury_cap
        tx.object(config.treasuryCap),
        // 4. coin_metadata
        tx.object(config.coinMetadata),
        // 5. affiliate_id
        tx.pure.string(config.affiliateId || ''),
        // 6. tokens_for_sale
        tx.pure.u64(config.tokensForSale),
        // 7. min_raise_amount
        tx.pure.u64(config.minRaiseAmount),
        // 8. max_raise_amount (Option)
        tx.pure.option('u64', config.maxRaiseAmount ?? null),
        // 9. allowed_caps (vector)
        tx.pure.vector('u64', config.allowedCaps.map(c => c)),
        // 10. start_delay_ms (Option)
        tx.pure.option('u64', config.startDelayMs ?? null),
        // 11. allow_early_completion
        tx.pure.bool(config.allowEarlyCompletion),
        // 12. description
        tx.pure.string(config.description),
        // 13. metadata_keys (vector)
        tx.pure.vector('string', config.metadataKeys || []),
        // 14. metadata_values (vector)
        tx.pure.vector('string', config.metadataValues || []),
        // 15. launchpad_fee (Coin<SUI>)
        launchpadFeeCoin,
        // 16. extra_mint_to_caller
        tx.pure.u64(config.extraMintToCaller ?? 0),
        // 17. clock
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Start a raise - stages success/failure actions and locks intents
   *
   * Call this after createRaise() with the raiseId and creatorCapId from the result.
   */
  startRaise(config: StartRaiseConfig): Transaction {
    const composer = new ActionComposer(this.packages, this.sharedObjects);

    // Stage success actions
    const builder = composer.new();
    for (const action of config.successActions) {
      builder.addAction(action);
    }
    builder.stageToLaunchpad(
      config.raiseId,
      config.creatorCapId,
      config.assetType,
      config.stableType,
      'success',
      config.clockId
    );

    // Stage failure actions (reuse same builder/tx)
    for (const action of config.failureActions) {
      builder.addAction(action);
    }
    builder.stageToLaunchpad(
      config.raiseId,
      config.creatorCapId,
      config.assetType,
      config.stableType,
      'failure',
      config.clockId
    );

    // Lock intents and start raise
    const tx = builder.getTransaction();
    this.buildLockIntents(
      tx,
      config.raiseId,
      config.creatorCapId,
      config.assetType,
      config.stableType
    );

    return tx;
  }

  /**
   * Contribute to a raise
   */
  contribute(config: ContributeConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const futarchyFactoryPackageId = this.packages.futarchyFactory;
    const { factory } = this.sharedObjects;

    // Merge coins if multiple provided
    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split payment and crank fee
    const [paymentCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amount)]);
    const [crankFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.crankFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::contribute`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.raiseId),
        tx.sharedObjectRef({
          objectId: factory.id,
          initialSharedVersion: factory.version,
          mutable: false,
        }),
        paymentCoin,
        tx.pure.u64(config.capTier),
        crankFeeCoin,
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Complete raise (settle, create DAO, finalize)
   */
  complete(config: CompleteRaiseConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const futarchyFactoryPackageId = this.packages.futarchyFactory;
    const { factory, packageRegistry } = this.sharedObjects;

    // 1. Settle raise
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::settle_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.raiseId), tx.object(clockId)],
    });

    // 2. Begin DAO creation
    const unsharedDao = tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::begin_dao_creation`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.raiseId),
        tx.object(factory.id),
        tx.object(packageRegistry.id),
        tx.object(clockId),
      ],
    });

    // 3. Finalize and share DAO
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::finalize_and_share_dao`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.raiseId),
        unsharedDao,
        tx.object(packageRegistry.id),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Claim tokens from a completed raise
   */
  claim(
    raiseId: string,
    assetType: string,
    stableType: string,
    clockId?: string
  ): Transaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    tx.moveCall({
      target: `${this.packages.futarchyFactory}::launchpad::claim_tokens`,
      typeArguments: [assetType, stableType],
      arguments: [tx.object(raiseId), tx.object(clock)],
    });

    return tx;
  }

  /**
   * Execute init actions after raise completion
   */
  executeActions(config: ExecuteLaunchpadActionsConfig): Transaction {
    return this.intentExecutor.execute({
      intentType: 'launchpad',
      accountId: config.accountId,
      raiseId: config.raiseId,
      assetType: config.assetType,
      stableType: config.stableType,
      clockId: config.clockId,
      actions: config.actionTypes.map((at) => {
        switch (at.type) {
          case 'create_stream':
            return { action: 'create_stream' as const, coinType: at.coinType };
          case 'create_pool_with_mint':
            return {
              action: 'create_pool_with_mint' as const,
              assetType: at.assetType,
              stableType: at.stableType,
              lpType: at.lpType,
              lpTreasuryCapId: at.lpTreasuryCapId,
              lpMetadataId: at.lpMetadataId,
            };
          case 'update_trading_params':
            return { action: 'update_trading_params' as const };
          case 'update_twap_config':
            return { action: 'update_twap_config' as const };
          case 'return_treasury_cap':
            return { action: 'return_treasury_cap' as const, coinType: at.coinType };
          case 'return_metadata':
            return {
              action: 'return_metadata' as const,
              coinType: at.coinType,
              keyType: `${this.packages.accountActions}::currency::CoinMetadataKey<${at.coinType}>`,
            };
          default:
            throw new Error(`Unknown action type: ${(at as any).type}`);
        }
      }),
    });
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get raise object details
   */
  async getRaise(raiseId: string): Promise<SuiObjectResponse> {
    return this.client.getObject({
      id: raiseId,
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
      },
    });
  }

  /**
   * Get all contribution events for a raise
   */
  async getContributions(raiseId: string): Promise<any[]> {
    const eventType = `${this.packages.futarchyFactory}::launchpad::ContributionAdded`;
    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });
    return response.data
      .map((event) => event.parsedJson)
      .filter((event: any) => event.raise_id === raiseId);
  }

  /**
   * Get all contributions by a specific address
   */
  async getContributionsBy(contributor: string): Promise<any[]> {
    const eventType = `${this.packages.futarchyFactory}::launchpad::ContributionAdded`;
    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });
    return response.data
      .map((event) => event.parsedJson)
      .filter((event: any) => event.contributor === contributor);
  }

  /**
   * Get contribution for a specific user in a specific raise
   */
  async getContributionBy(raiseId: string, contributor: string): Promise<any | null> {
    const contributions = await this.getContributions(raiseId);
    return contributions.find((c: any) => c.contributor === contributor) || null;
  }

  /**
   * Check if a raise is settled
   */
  async isSettled(raiseId: string): Promise<boolean> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return false;
    }
    const fields = raise.data.content.fields as any;
    return fields.settlement_done === true;
  }

  /**
   * Get raise state (0=FUNDING, 1=SUCCESSFUL, 2=FAILED)
   */
  async getState(raiseId: string): Promise<number> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return 0;
    }
    const fields = raise.data.content.fields as any;
    return Number(fields.state || 0);
  }

  /**
   * Get total raised amount
   */
  async getTotalRaised(raiseId: string): Promise<bigint> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return 0n;
    }
    const fields = raise.data.content.fields as any;
    return BigInt(fields.stable_coin_vault?.fields?.value || '0');
  }

  /**
   * Get token claim events
   */
  async getTokenClaims(raiseId: string): Promise<any[]> {
    const eventType = `${this.packages.futarchyFactory}::launchpad::TokensClaimed`;
    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });
    return response.data
      .map((event) => event.parsedJson)
      .filter((event: any) => event.raise_id === raiseId);
  }

  /**
   * Get refund claim events
   */
  async getRefundClaims(raiseId: string): Promise<any[]> {
    const eventType = `${this.packages.futarchyFactory}::launchpad::RefundClaimed`;
    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });
    return response.data
      .map((event) => event.parsedJson)
      .filter((event: any) => event.raise_id === raiseId);
  }

  /**
   * Get raise start time (timestamp in milliseconds)
   */
  async getStartTime(raiseId: string): Promise<number> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return 0;
    }
    const fields = raise.data.content.fields as any;
    return Number(fields.start_time_ms || 0);
  }

  /**
   * Get raise deadline (timestamp in milliseconds)
   */
  async getDeadline(raiseId: string): Promise<number> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return 0;
    }
    const fields = raise.data.content.fields as any;
    return Number(fields.deadline_ms || 0);
  }

  /**
   * Get raise description
   */
  async getDescription(raiseId: string): Promise<string> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return '';
    }
    const fields = raise.data.content.fields as any;
    return String(fields.description || '');
  }

  /**
   * Get final raise amount after settlement
   */
  async getFinalAmount(raiseId: string): Promise<bigint> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return 0n;
    }
    const fields = raise.data.content.fields as any;
    return BigInt(fields.final_raise_amount || 0);
  }

  /**
   * Get allowed contribution caps (sorted array)
   */
  async getAllowedCaps(raiseId: string): Promise<bigint[]> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return [];
    }
    const fields = raise.data.content.fields as any;
    const caps = fields.allowed_caps || [];
    return Array.isArray(caps) ? caps.map((c: any) => BigInt(c)) : [];
  }

  /**
   * Get cap sums (cumulative contributions per tier)
   */
  async getCapSums(raiseId: string): Promise<bigint[]> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return [];
    }
    const fields = raise.data.content.fields as any;
    const sums = fields.cap_sums || [];
    return Array.isArray(sums) ? sums.map((s: any) => BigInt(s)) : [];
  }

  /**
   * Get verification level (0-255)
   */
  async getVerificationLevel(raiseId: string): Promise<number> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return 0;
    }
    const fields = raise.data.content.fields as any;
    return Number(fields.verification_level || 0);
  }

  /**
   * Get verification attestation URL
   */
  async getAttestationUrl(raiseId: string): Promise<string> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return '';
    }
    const fields = raise.data.content.fields as any;
    return String(fields.attestation_url || '');
  }

  /**
   * Get admin review text
   */
  async getAdminReviewText(raiseId: string): Promise<string> {
    const raise = await this.getRaise(raiseId);
    if (!raise.data?.content || raise.data.content.dataType !== 'moveObject') {
      return '';
    }
    const fields = raise.data.content.fields as any;
    return String(fields.admin_review_text || '');
  }

  /**
   * Get all raises from events
   */
  async getAll(): Promise<any[]> {
    const eventType = `${this.packages.futarchyFactory}::launchpad::RaiseCreated`;
    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });
    return response.data.map((event) => event.parsedJson);
  }

  /**
   * Get raises created by a specific address
   */
  async getByCreator(creator: string): Promise<any[]> {
    const allRaises = await this.getAll();
    return allRaises.filter((raise: any) => raise.creator === creator);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private buildLockIntents(
    tx: Transaction,
    raiseId: string,
    creatorCapId: string,
    assetType: string,
    stableType: string
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyFactory}::launchpad::lock_intents_and_start_raise`,
      typeArguments: [assetType, stableType],
      arguments: [tx.object(raiseId), tx.object(creatorCapId)],
    });
  }
}