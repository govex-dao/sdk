/**
 * ProposalService - Governance proposals
 *
 * Workflow:
 * 1. create(config)              - Create a new proposal
 * 2. addActions(config)          - Add actions to a specific outcome
 * 3. advanceToReview(config)     - Create escrow and advance to REVIEW state
 * 4. advanceToTrading(config)    - Advance from REVIEW to TRADING state
 * 5. (trading period)            - Users trade via sdk.proposal.trade.*
 * 6. finalizeAndExecute(config)  - Finalize proposal + execute winning actions
 * 7. redeemTokens(config)        - Users redeem conditional tokens
 *
 * Sub-namespaces:
 * - sponsorship: Proposal sponsorship operations
 * - trade: Trade on proposal outcomes
 * - twap: TWAP price oracle
 *
 * @module services/proposal
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import {
  CreateProposalConfig,
  AddProposalActionsConfig,
  StartProposalConfig,
  AdvanceToReviewConfig,
  AdvanceToTradingConfig,
  FinalizeProposalConfig,
  ExecuteProposalActionsConfig,
  ProposalSpotSwapConfig,
  Packages,
  SharedObjects,
  SDKConfigWithObjects,
} from '@/types';
import { IntentExecutor } from '../intents/intent-executor';
import { ProposalSponsorship } from './sponsorship';
import { ProposalTrade } from './trade';
import { ProposalTWAP } from './twap';
import { ProposalEscrow } from './escrow';
import { ActionComposer } from '../intents/action-composer';
import { Proposal } from '@/protocol/markets/proposal';

// Re-export sub-namespaces
export { ProposalSponsorship } from './sponsorship';
export { ProposalTrade } from './trade';
export { ProposalTWAP } from './twap';

export class ProposalService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;

  // Sub-namespaces
  public readonly sponsorship: ProposalSponsorship;
  public readonly trade: ProposalTrade;
  public readonly twap: ProposalTWAP;
  public readonly escrow: ProposalEscrow;

  constructor({client, packages, sharedObjects}: SDKConfigWithObjects) {
    this.client = client;
    this.packages = packages;
    this.sharedObjects = sharedObjects;

    // Initialize sub-namespaces
    this.sponsorship = new ProposalSponsorship(client, packages);
    this.trade = new ProposalTrade(client, packages);
    this.twap = new ProposalTWAP(client, packages);
    this.escrow = new ProposalEscrow(client, packages.futarchyGovernance);
  }

  // ============================================================================
  // MAIN WORKFLOW METHODS
  // ============================================================================

  /**
   * Create a new proposal
   */
  create(config: CreateProposalConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyMarketsCore, accountProtocol } = this.packages;

    // Merge fee coins if multiple provided
    const coinObjects = config.feeCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    if (!firstCoin) throw new Error('No fee coin provided');
    const [feePayment] = tx.splitCoins(firstCoin, [tx.pure.u64(config.feeAmount)]);

    // Create Option::None for vector<ActionSpec>
    const noneOption = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [`vector<${accountProtocol}::intents::ActionSpec>`],
      arguments: [],
    });

    tx.moveCall({
      target: `${futarchyMarketsCore}::proposal::new_premarket`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoAccountId),
        tx.pure.address(config.treasuryAddress),
        tx.pure.string(config.title),
        tx.pure.string(config.introduction),
        tx.pure.string(config.metadata),
        tx.pure.vector('string', config.outcomeMessages),
        tx.pure.vector('string', config.outcomeDetails),
        tx.pure.address(config.proposer),
        tx.pure.bool(config.usedQuota),
        feePayment,
        noneOption,
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    tx.transferObjects([firstCoin], tx.pure.address(config.proposer));

    return tx;
  }

  /**
   * Start a proposal - stages actions for all outcomes + advances to review in one PTB
   *
   */
  startProposal(config: StartProposalConfig): Transaction {
    const composer = new ActionComposer(this.packages, this.sharedObjects);
    const builder = composer.new();

    // Stage actions for each outcome
    for (const [outcomeIndex, actions] of Object.entries(config.outcomeActions)) {
      for (const action of actions) {
        builder.addAction(action);
      }
      builder.stageToProposal(
        config.proposalId,
        config.assetType,
        config.stableType,
        parseInt(outcomeIndex),
        config.maxActionsPerOutcome
      );
    }

    // Get the transaction and add advanceToReview calls
    const tx = builder.getTransaction();
    this.buildAdvanceToReview(tx, config);

    return tx;
  }

  /**
 * Add actions to a specific outcome
 */
  addActions(config: AddProposalActionsConfig): Transaction {
    const composer = new ActionComposer(this.packages, this.sharedObjects);
    const builder = composer.new();

    for (const action of config.actions) {
      builder.addAction(action);
    }

    builder.stageToProposal(
      config.proposalId,
      config.assetType,
      config.stableType,
      config.outcomeIndex,
      config.maxActionsPerOutcome
    );

    return builder.build();
  }

  /**
   * Finalize proposal and execute winning actions in one PTB
   */
  finalizeAndExecute(config: FinalizeProposalConfig & ExecuteProposalActionsConfig): Transaction {
    const clockId = config.clockId || '0x6';

    const executor = new IntentExecutor({client: this.client, packages: this.packages, sharedObjects: this.sharedObjects});

    return executor.execute({
      intentType: 'proposal',
      accountId: config.daoAccountId,
      proposalId: config.proposalId,
      escrowId: config.escrowId,
      assetType: config.assetType,
      stableType: config.stableType,
      actions: config.actionTypes,
      clockId,
      prependCalls: (tx: Transaction) => {
        // Finalize proposal before executing actions
        this.finalize(config, tx);
      },
    });
  }

  private finalize(config: FinalizeProposalConfig, tx?: Transaction): Transaction {
    tx = tx || new Transaction();
    const clockId = config.clockId || '0x6';

    Proposal.finalizeProposalWithSpotPool(tx, {
      governancePackageId: this.packages.futarchyGovernance,
      assetType: config.assetType,
      stableType: config.stableType,
      lpType: config.lpType,
      daoAccountId: config.daoAccountId,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      proposalId: config.proposalId,
      escrowId: config.escrowId,
      spotPoolId: config.spotPoolId,
      clock: clockId,
    });

    return tx;
  }

  /**
   * Redeem conditional tokens after proposal finalization
   */
  redeemTokens(
    proposalId: string,
    escrowId: string,
    assetType: string,
    stableType: string,
    conditionalCoinId: string,
    conditionalCoinType: string,
    outcomeIndex: number,
    isAsset: boolean,
    recipient: string,
    clockId?: string
  ): Transaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyMarketsOperations } = this.packages;

    const redeemTarget = isAsset
      ? `${futarchyMarketsOperations}::liquidity_interact::redeem_conditional_asset`
      : `${futarchyMarketsOperations}::liquidity_interact::redeem_conditional_stable`;

    const redeemedCoin = tx.moveCall({
      target: redeemTarget,
      typeArguments: [assetType, stableType, conditionalCoinType],
      arguments: [
        tx.object(proposalId),
        tx.object(escrowId),
        tx.object(conditionalCoinId),
        tx.pure.u64(outcomeIndex),
        tx.sharedObjectRef({
          objectId: clock,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    tx.transferObjects([redeemedCoin], tx.pure.address(recipient));

    return tx;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Advance proposal from PREMARKET to REVIEW state
   */
  advanceToReview(config: AdvanceToReviewConfig): Transaction {
    const tx = new Transaction();
    this.buildAdvanceToReview(tx, config);
    return tx;
  }

  private buildAdvanceToReview(tx: Transaction, config: AdvanceToReviewConfig | StartProposalConfig): void {
    const clockId = config.clockId || '0x6';

    const {
      futarchyMarketsCore,
      futarchyMarketsPrimitives,
      oneShotUtils,
    } = this.packages;

    const outcomeCaps: Record<number, { asset?: any; stable?: any; assetType?: string; stableType?: string }> = {};

    // 1. Take conditional coins from registry if provided
    if (config.conditionalCoinsRegistry && config.conditionalCoinsRegistry.coinSets.length > 0) {
      if (!oneShotUtils) {
        throw new Error(
          'conditionalCoinsRegistry provided but oneShotUtils package is not configured in the SDK. ' +
          'Ensure futarchy_one_shot_utils is in deployments/_all-packages.json and the registry was created with the same package.'
        );
      }
    }

    if (config.conditionalCoinsRegistry && config.conditionalCoinsRegistry.coinSets.length > 0 && oneShotUtils) {
      const registryId = config.conditionalCoinsRegistry.registryId;
      let feeCoin: any = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);

      for (const coinSet of config.conditionalCoinsRegistry.coinSets) {
        const assetResults: any = tx.moveCall({
          target: `${oneShotUtils}::coin_registry::take_coin_set_for_ptb`,
          typeArguments: [coinSet.assetCoinType],
          arguments: [
            tx.object(registryId),
            tx.pure.id(coinSet.assetCapId),
            feeCoin,
            tx.sharedObjectRef({
              objectId: clockId,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

        outcomeCaps[coinSet.outcomeIndex] = outcomeCaps[coinSet.outcomeIndex] || {};
        outcomeCaps[coinSet.outcomeIndex].asset = assetResults;
        outcomeCaps[coinSet.outcomeIndex].assetType = coinSet.assetCoinType;
        feeCoin = assetResults[2];

        const stableResults: any = tx.moveCall({
          target: `${oneShotUtils}::coin_registry::take_coin_set_for_ptb`,
          typeArguments: [coinSet.stableCoinType],
          arguments: [
            tx.object(registryId),
            tx.pure.id(coinSet.stableCapId),
            feeCoin,
            tx.sharedObjectRef({
              objectId: clockId,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

        outcomeCaps[coinSet.outcomeIndex].stable = stableResults;
        outcomeCaps[coinSet.outcomeIndex].stableType = coinSet.stableCoinType;
        feeCoin = stableResults[2];
      }

      tx.transferObjects([feeCoin], tx.pure.address(config.senderAddress));
    }

    // 2. Create escrow for market
    const escrow = tx.moveCall({
      target: `${futarchyMarketsCore}::proposal::create_escrow_for_market`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // 3. Register conditional caps with escrow
    if (config.conditionalCoinsRegistry && config.conditionalCoinsRegistry.coinSets.length > 0) {
      for (const coinSet of config.conditionalCoinsRegistry.coinSets) {
        const caps = outcomeCaps[coinSet.outcomeIndex];
        if (!caps?.asset || !caps?.stable) continue;

        tx.moveCall({
          target: `${futarchyMarketsCore}::proposal::add_conditional_coin_via_account`,
          typeArguments: [config.assetType, config.stableType, caps.assetType!],
          arguments: [
            tx.object(config.proposalId),
            tx.pure.u64(coinSet.outcomeIndex),
            tx.pure.bool(true),
            caps.asset[0],
            caps.asset[1],
            tx.object(config.daoAccountId),
            tx.pure.string('ASSET'),
            tx.pure.string('STABLE'),
          ],
        });

        tx.moveCall({
          target: `${futarchyMarketsCore}::proposal::add_conditional_coin_via_account`,
          typeArguments: [config.assetType, config.stableType, caps.stableType!],
          arguments: [
            tx.object(config.proposalId),
            tx.pure.u64(coinSet.outcomeIndex),
            tx.pure.bool(false),
            caps.stable[0],
            caps.stable[1],
            tx.object(config.daoAccountId),
            tx.pure.string('ASSET'),
            tx.pure.string('STABLE'),
          ],
        });

        tx.moveCall({
          target: `${futarchyMarketsCore}::proposal::register_outcome_caps_with_escrow`,
          typeArguments: [
            config.assetType,
            config.stableType,
            caps.assetType!,
            caps.stableType!,
          ],
          arguments: [
            tx.object(config.proposalId),
            escrow,
            tx.pure.u64(coinSet.outcomeIndex),
          ],
        });
      }
    }

    // 4. Create conditional AMM pools
    Proposal.createConditionalAmmPools(tx, {
      marketsCorePackageId: futarchyMarketsCore,
      assetType: config.assetType,
      stableType: config.stableType,
      lpType: config.lpType,
      proposalId: config.proposalId,
      escrow,
      spotPoolId: config.spotPoolId,
      clock: clockId,
    });

    // 5. Get IDs for initialize_market_fields
    const marketStateId = tx.moveCall({
      target: `${futarchyMarketsPrimitives}::coin_escrow::market_state_id`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [escrow],
    });

    const escrowId = tx.moveCall({
      target: '0x2::object::id',
      typeArguments: [
        `${futarchyMarketsPrimitives}::coin_escrow::TokenEscrow<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [escrow],
    });

    // 6. Initialize market fields
    const clockRef = tx.sharedObjectRef({
      objectId: clockId,
      initialSharedVersion: 1,
      mutable: false,
    });
    const timestamp = tx.moveCall({
      target: '0x2::clock::timestamp_ms',
      arguments: [clockRef],
    });

    tx.moveCall({
      target: `${futarchyMarketsCore}::proposal::initialize_market_fields`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        marketStateId,
        escrowId,
        timestamp,
        tx.pure.address(config.senderAddress),
      ],
    });

    // 7. Share the escrow
    tx.moveCall({
      target: '0x2::transfer::public_share_object',
      typeArguments: [
        `${futarchyMarketsPrimitives}::coin_escrow::TokenEscrow<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [escrow],
    });
  }

  /**
   * Advance proposal from REVIEW to TRADING state
   */
  advanceToTrading(config: AdvanceToTradingConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    Proposal.advanceProposalState(tx, {
      governancePackageId: this.packages.futarchyGovernance,
      assetType: config.assetType,
      stableType: config.stableType,
      lpType: config.lpType,
      daoAccountId: config.daoAccountId,
      proposalId: config.proposalId,
      escrowId: config.escrowId,
      spotPoolId: config.spotPoolId,
      clock: clockId,
    });

    return tx;
  }

  /**
   * Execute a spot swap during an active proposal
   */
  spotSwap(config: ProposalSpotSwapConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const {
      futarchyMarketsOperations,
      futarchyMarketsPrimitives,
    } = this.packages;

    // Merge input coins if multiple provided
    const coinObjects = config.inputCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split input amount
    const [inputCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amountIn)]);

    // Create Option::None for existing balance
    const noneBalance = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [
        `${futarchyMarketsPrimitives}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [],
    });

    // Execute swap
    const swapTarget =
      config.direction === 'stable_to_asset'
        ? `${futarchyMarketsOperations}::swap_entry::swap_spot_stable_to_asset`
        : `${futarchyMarketsOperations}::swap_entry::swap_spot_asset_to_stable`;

    const [outputOpt, balanceOpt] = tx.moveCall({
      target: swapTarget,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.spotPoolId),
        tx.object(config.proposalId),
        tx.object(config.escrowId),
        inputCoin,
        tx.pure.u64(config.minAmountOut),
        tx.pure.address(config.recipient),
        noneBalance,
        tx.pure.bool(false), // return_balance = false
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Destroy empty options
    tx.moveCall({
      target: '0x1::option::destroy_none',
      typeArguments: [
        `0x2::coin::Coin<${config.direction === 'stable_to_asset' ? config.assetType : config.stableType}>`,
      ],
      arguments: [outputOpt],
    });

    tx.moveCall({
      target: '0x1::option::destroy_none',
      typeArguments: [
        `${futarchyMarketsPrimitives}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [balanceOpt],
    });

    // Return remaining input coins
    tx.transferObjects([firstCoin], tx.pure.address(config.recipient));

    return tx;
  }

  /**
   * Clean up expired intents (cranker operation)
   */
  cleanUpExpiredIntents(
    daoAccountId: string,
    maxToClean: number = 20,
    clockId?: string
  ): Transaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyGovernanceActions } = this.packages;
    const packageRegistryId = this.sharedObjects.packageRegistry.id;

    tx.moveCall({
      target: `${futarchyGovernanceActions}::intent_janitor::cleanup_expired_futarchy_intents`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(packageRegistryId),
        tx.pure.u64(Math.min(maxToClean, 20)),
        tx.object(clock),
      ],
    });

    return tx;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get proposal info
   */
  async getInfo(proposalId: string): Promise<SuiObjectResponse> {
    return this.client.getObject({
      id: proposalId,
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
      },
    });
  }

  /**
   * Get market info for a proposal
   */
  async getMarket(proposalId: string): Promise<{
    marketStateId: string;
    escrowId: string;
    state: string;
    winningOutcome: number | null;
  }> {
    const proposal = await this.getInfo(proposalId);

    if (!proposal.data?.content || proposal.data.content.dataType !== 'moveObject') {
      throw new Error('Proposal not found');
    }

    const fields = proposal.data.content.fields as any;

    return {
      marketStateId: fields.market_state_id || '',
      escrowId: fields.escrow_id || '',
      state: fields.state || 'UNKNOWN',
      winningOutcome: fields.winning_outcome ?? null,
    };
  }

  /**
   * Get all proposals from events
   */
  async getAll(): Promise<any[]> {
    const eventType = `${this.packages.futarchyMarketsCore}::proposal::ProposalCreated`;

    const response = await this.client.queryEvents({
      query: { MoveEventType: eventType },
    });

    return response.data.map((event) => event.parsedJson);
  }

  /**
   * Get all proposals for a specific DAO
   */
  async getByDao(daoId: string): Promise<any[]> {
    const allProposals = await this.getAll();
    return allProposals.filter((proposal: any) => proposal.dao_id === daoId);
  }
}
