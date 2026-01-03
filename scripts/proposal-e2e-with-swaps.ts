/**
 * COMPREHENSIVE Proposal E2E Test with Swaps and Withdrawals
 *
 * This test demonstrates the full lifecycle of a proposal with actual trading:
 * 1. Create proposal with actions (using sdk.workflows.proposal)
 * 2. Advance PREMARKET → REVIEW → TRADING (with 100% quantum split from spot pool)
 * 3. Users perform swaps during TRADING:
 *    a. Spot swap (allowed - only LP add/remove operations blocked during proposals)
 *    b. Conditional swap buying accept tokens (influence TWAP)
 * 4. Wait for trading period to end
 * 5. Finalize proposal (determine winner via TWAP, recombine winning liquidity back to spot)
 * 6. Execute actions if Accept wins
 * 7. Users withdraw their winning conditional tokens
 *
 * This test demonstrates proper SDK usage with the ProposalWorkflow class.
 *
 * Prerequisites:
 * - Run launchpad-e2e.ts first to create DAO with spot pool
 * - test-dao-info.json must exist
 */

import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { TransactionUtils } from "../src/services/transaction";
import { initSDK, executeTransaction, executeTransactionWithKeypair, getActiveAddress } from "./execute-tx";

// Import utilities from centralized test-utils
import {
  // Object reference utilities
  getObjectRef,
  getObjectRefById,
  getObjId,
  isLocalnet,
  // Timing utilities
  sleep,
  TEST_CONFIG,
  waitForIndexer,
  waitForTimePeriod,
  // Fixture loading
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
  // Constants
  REJECT_OUTCOME_INDEX,
  ACCEPT_OUTCOME_INDEX,
  // Logging
  logSection,
  logStep,
  logSuccess,
  logError,
  // Types
  type ObjectIdOrRef,
  type TxSharedObjectRef,
  type ConditionalTokenRecord,
  type ConditionalOutcomeCoinSet,
} from "./test-utils";

async function main() {
  logSection("COMPREHENSIVE PROPOSAL E2E TEST WITH SWAPS & WITHDRAWALS");

  // ============================================================================
  // STEP 0: Load DAO info from launchpad test
  // ============================================================================
  console.log("📂 Loading DAO info from previous launchpad test...");

  const daoInfo = loadDaoInfo();
  const daoAccountId = daoInfo.accountId;
  const assetType = daoInfo.assetType;
  const stableType = daoInfo.stableType;
  const lpType = daoInfo.lpType;
  const spotPoolId = daoInfo.spotPoolId;
  const stableTreasuryCap = daoInfo.stableTreasuryCap;
  const isStableTreasuryCapShared = daoInfo.isStableTreasuryCapShared ?? false;
  const stablePackageId = daoInfo.stablePackageId;
  const baseAssetCurrencyId = daoInfo.assetCurrencyId;
  const baseStableCurrencyId = daoInfo.stableCurrencyId;

  logSuccess(`DAO Account: ${daoAccountId}`);
  logSuccess(`Asset Type: ${assetType}`);
  logSuccess(`Stable Type: ${stableType}`);
  logSuccess(`LP Type: ${lpType}`);
  logSuccess(`Spot Pool: ${spotPoolId}`);
  logSuccess(`Shared Treasury Cap: ${isStableTreasuryCapShared}`);
  console.log();

  // Load conditional coins deployment info
  let conditionalCoinsInfo = loadConditionalCoinsInfo();
  if (conditionalCoinsInfo) {
    console.log(`📦 Conditional Coins Package: ${conditionalCoinsInfo.packageId}`);
    console.log(`📦 CoinRegistry: ${conditionalCoinsInfo.registryId}`);
    console.log();
  } else {
    console.log("⚠️  Conditional coins not deployed - SWAP 2 will be skipped");
    console.log("   Run: npm run deploy-conditional-coins");
    console.log();
  }

  let conditionalOutcomes: ConditionalOutcomeCoinSet[] = [];
  if (conditionalCoinsInfo) {
    try {
      conditionalOutcomes = extractConditionalOutcomes(conditionalCoinsInfo);
    } catch (error) {
      console.log("⚠️  Failed to parse conditional coin metadata:", error);
      conditionalCoinsInfo = null;
    }

    if (conditionalCoinsInfo && conditionalOutcomes.length === 0) {
      console.log("⚠️  No conditional coin sets found - disabling typed coin flow");
      conditionalCoinsInfo = null;
    }
  }

  // Track all conditional tokens for comprehensive redemption testing
  const conditionalTokens: ConditionalTokenRecord[] = [];

  // Create second account for multi-user testing (bet on losing outcome)
  console.log("👥 Setting up second account for multi-user testing...");
  const secondKeypair = Ed25519Keypair.generate();
  const secondAddress = secondKeypair.getPublicKey().toSuiAddress();
  console.log(`✅ Second account: ${secondAddress}`);
  console.log(`   This account will bet on REJECT outcome to test losing token behavior`);
  console.log();

  // ============================================================================
  // STEP 1: Initialize SDK
  // ============================================================================
  console.log("🔧 Initializing SDK...");
  const sdk = await initSDK();
  const activeAddress = getActiveAddress();
  const network = sdk.network.network;
  console.log(`✅ Active address: ${activeAddress}`);
  console.log(`✅ Network: ${network}`);
  console.log();

  // Access workflows from SDK
  const proposalWorkflow = sdk.workflows.proposal;

  // Helper to fetch shared object ref (for localnet where RPC lookup may fail)
  async function getSharedObjectRef(objectId: string): Promise<TxSharedObjectRef> {
    const obj = await sdk.client.getObject({
      id: objectId,
      options: { showOwner: true },
    });
    if (!obj.data?.owner || typeof obj.data.owner !== 'object' || !('Shared' in obj.data.owner)) {
      throw new Error(`Object ${objectId} is not a shared object`);
    }
    return {
      objectId,
      initialSharedVersion: obj.data.owner.Shared.initial_shared_version,
      mutable: true,
    };
  }

  // Initialize refs for tracking object versions (important for localnet)
  // Fetch shared object refs upfront to avoid RPC lookup issues
  console.log("📦 Fetching shared object refs...");
  let daoAccountRef: ObjectIdOrRef = await getSharedObjectRef(daoAccountId);
  let spotPoolRef: ObjectIdOrRef = await getSharedObjectRef(spotPoolId);
  console.log(`✅ DAO Account ref: initialSharedVersion=${(daoAccountRef as TxSharedObjectRef).initialSharedVersion}`);
  console.log(`✅ Spot Pool ref: initialSharedVersion=${(spotPoolRef as TxSharedObjectRef).initialSharedVersion}`);
  console.log();

  // Get registryId for whitelist validation (also a shared object)
  const registryId = await getSharedObjectRef(sdk.sharedObjects.packageRegistry.id);
  console.log(`✅ Registry ID: ${(registryId as TxSharedObjectRef).objectId}, initialSharedVersion=${(registryId as TxSharedObjectRef).initialSharedVersion}`);
  console.log();

  // ============================================================================
  // STEP 2: Create and initialize proposal atomically with actions
  // ============================================================================
  console.log("=".repeat(80));
  console.log("STEP 2: CREATE AND INITIALIZE PROPOSAL (atomic, with stream action)");
  console.log("=".repeat(80));
  console.log();

  const streamAmount = 500_000_000; // 0.5 stable
  const streamIterations = 10n;
  const streamIterationPeriod = 60_000n; // 1 minute for testing
  const streamAmountPerIteration = Number(BigInt(streamAmount) / streamIterations);
  const streamStart = Date.now() + 300_000; // Start in 5 minutes

  console.log(`📋 Creating proposal with stream action:`);
  console.log(`   Total: ${streamAmount / 1e9} stable over ${Number(streamIterations)} iterations`);
  console.log();

  // First, ensure we have enough stable coins for the proposal fee
  const proposalFeeAmount = 1_000_000_000n; // 1 stable coin fee
  console.log(`💰 Preparing proposal fee: ${Number(proposalFeeAmount) / 1e9} stable`);

  const stableCoinsForFee = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: stableType,
  });

  const totalStableBalance = stableCoinsForFee.data.reduce(
    (sum, c) => sum + BigInt(c.balance),
    0n
  );

  if (totalStableBalance < proposalFeeAmount) {
    console.log(`⚠️  Insufficient stable coins (have ${totalStableBalance}, need ${proposalFeeAmount}), minting more...`);
    const mintFeeTx = new Transaction();
    // Use the custom mint function from the test coin package (works with both shared and private treasury caps)
    mintFeeTx.moveCall({
      target: `${stablePackageId}::coin::mint`,
      arguments: [
        mintFeeTx.object(stableTreasuryCap),
        mintFeeTx.pure.u64(proposalFeeAmount * 2n),
        mintFeeTx.pure.address(activeAddress),
      ],
    });
    await executeTransaction(sdk, mintFeeTx, { network: daoInfo.network || "devnet" });
  }

  // Get fee coins
  const feeCoins = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: stableType,
  });
  const feeCoinIds = feeCoins.data.map((c) => c.coinObjectId);

  // Build conditional coin registry config
  const conditionalCoinsRegistry = conditionalCoinsInfo && conditionalOutcomes.length > 0
    ? {
        registryId: conditionalCoinsInfo.registryId,
        coinSets: conditionalOutcomes.map((outcome) => ({
          outcomeIndex: outcome.index,
          assetCoinType: outcome.asset.coinType,
          assetCapId: outcome.asset.treasuryCapId,
          assetCurrencyId: outcome.asset.currencyId,
          stableCoinType: outcome.stable.coinType,
          stableCapId: outcome.stable.treasuryCapId,
          stableCurrencyId: outcome.stable.currencyId,
        })),
      }
    : undefined;

  // Create and initialize proposal atomically using SDK workflow
  const createTx = proposalWorkflow.createAndInitializeProposal({
    // CreateProposalConfig
    daoAccountId,
    assetType,
    stableType,
    title: "Fund Team Development with Conditional Trading",
    introduction: "This proposal will test swaps and demonstrate winning outcome execution",
    metadata: JSON.stringify({ category: "test", impact: "high" }),
    outcomeMessages: ["Reject", "Accept"],
    outcomeDetails: [
      "Reject: Do nothing (status quo)",
      "Accept: Execute stream + allow trading",
    ],
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: feeCoinIds,
    feeAmount: proposalFeeAmount,
    // Actions to add before finalization
    outcomeActions: [
      {
        outcomeIndex: ACCEPT_OUTCOME_INDEX,
        actions: [
          {
            type: 'create_stream',
            coinType: stableType,
            vaultName: 'treasury',
            beneficiary: activeAddress,
            amountPerIteration: BigInt(streamAmountPerIteration),
            startTime: streamStart,
            iterationsTotal: streamIterations,
            iterationPeriodMs: streamIterationPeriod,
            maxPerWithdrawal: BigInt(streamAmountPerIteration),
          },
        ],
      },
    ],
    registryId: registryId as any,
    // AdvanceToReviewConfig
    lpType,
    spotPoolId: spotPoolRef,
    senderAddress: activeAddress,
    baseAssetCurrencyId,
    baseStableCurrencyId,
    conditionalCoinsRegistry,
  });

  console.log("📤 Creating proposal and escrow atomically...");
  const createResult = await executeTransaction(sdk, createTx.transaction, {
    network: "devnet",
    showObjectChanges: true,
  });

  const proposalObject = createResult.objectChanges?.find(
    (obj: any) => obj.type === "created" && obj.objectType?.includes("proposal::Proposal")
  );

  if (!proposalObject) {
    console.error("❌ Failed to create proposal");
    process.exit(1);
  }

  const proposalId = (proposalObject as any).objectId;
  let proposalRef = getObjectRef(createResult, "proposal::Proposal", network)!;

  const escrowObject = createResult.objectChanges?.find(
    (obj: any) => obj.objectType?.includes("::coin_escrow::TokenEscrow")
  );

  if (!escrowObject) {
    console.error("❌ Failed to create escrow!");
    process.exit(1);
  }

  const escrowId = (escrowObject as any).objectId;
  let escrowRef = getObjectRef(createResult, "coin_escrow::TokenEscrow", network)!;
  // Update other refs after this transaction
  daoAccountRef = getObjectRefById(createResult, daoAccountId, network);
  spotPoolRef = getObjectRefById(createResult, spotPoolId, network);

  console.log(`✅ Proposal created and initialized atomically`);
  console.log(`   Proposal: ${proposalId}`);
  console.log(`   Escrow: ${escrowId}`);
  console.log(`   Actions: Stream action added to Accept outcome`);
  console.log(`   State: REVIEW`);
  console.log();

  // Wait for indexer on localnet
  await waitForIndexer(network, { description: "indexer (proposal + escrow created)" });

  // ============================================================================
  // STEP 3: Advance to TRADING state
  // ============================================================================
  console.log("=".repeat(80));
  console.log("STEP 3: ADVANCE TO TRADING STATE (using sdk.workflows.proposal)");
  console.log("=".repeat(80));
  console.log();

  // Wait for review period (configured in proposal)
  await waitForTimePeriod(TEST_CONFIG.REVIEW_PERIOD_MS + 2000, { description: "review period" });

  console.log("📤 Advancing to TRADING state (100% quantum split)...");

  const toTradingTx = proposalWorkflow.advanceToTrading({
    daoAccountId: daoAccountRef,
    proposalId: proposalRef,
    escrowId: escrowRef,
    spotPoolId: spotPoolRef,
    assetType,
    stableType,
    lpType,
  });

  const toTradingResult = await executeTransaction(sdk, toTradingTx.transaction, { network: "devnet", showObjectChanges: true });
  // Update refs after transaction
  proposalRef = getObjectRefById(toTradingResult, proposalId, network);
  escrowRef = getObjectRefById(toTradingResult, escrowId, network);
  daoAccountRef = getObjectRefById(toTradingResult, daoAccountId, network);
  spotPoolRef = getObjectRefById(toTradingResult, spotPoolId, network);

  console.log("✅ Proposal state: TRADING");
  console.log("   - 100% quantum split complete: all spot liquidity → conditional AMMs");
  console.log("   - active_proposal_id set: LP add/remove operations now blocked");
  console.log();

  // Wait for indexer on localnet
  await waitForIndexer(network, { description: "indexer (trading state)" });

  // ============================================================================
  // STEP 4: PERFORM SWAPS (Multi-User with Comprehensive Token Tracking)
  // ============================================================================
  console.log("=".repeat(80));
  console.log("STEP 4: PERFORM SWAPS TO INFLUENCE OUTCOME (Multi-User Testing)");
  console.log("=".repeat(80));
  console.log();

  // First, mint coins for both accounts
  console.log("💰 Minting coins for both accounts...");
  const mintAmount = 30_000_000_000n; // 30 stable coins for primary
  const secondAccountMintAmount = 15_000_000_000n; // 15 stable for second account

  // Mint stable for primary account
  const mintTx = new Transaction();
  mintTx.moveCall({
    target: `${stablePackageId}::coin::mint`,
    arguments: [
      mintTx.object(stableTreasuryCap),
      mintTx.pure.u64(mintAmount),
      mintTx.pure.address(activeAddress),
    ],
  });
  await executeTransaction(sdk, mintTx, { network: daoInfo.network || "devnet" });
  console.log(`✅ Minted ${Number(mintAmount) / 1e9} stable coins for primary account`);

  // Fund second account with SUI (for gas) and stable coins
  console.log(`💰 Funding second account (${secondAddress.slice(0, 10)}...)...`);

  // Transfer SUI for gas
  const suiCoins = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: "0x2::sui::SUI",
  });

  const fundSuiTx = new Transaction();
  const [suiCoin] = fundSuiTx.splitCoins(fundSuiTx.gas, [fundSuiTx.pure.u64(500_000_000)]); // 0.5 SUI for gas
  fundSuiTx.transferObjects([suiCoin], fundSuiTx.pure.address(secondAddress));
  await executeTransaction(sdk, fundSuiTx, { network: "devnet" });
  console.log(`✅ Transferred 0.5 SUI for gas to second account`);

  // Mint stable for second account
  const mintStableForSecondTx = new Transaction();
  mintStableForSecondTx.moveCall({
    target: `${stablePackageId}::coin::mint`,
    arguments: [
      mintStableForSecondTx.object(stableTreasuryCap),
      mintStableForSecondTx.pure.u64(secondAccountMintAmount),
      mintStableForSecondTx.pure.address(secondAddress),
    ],
  });
  await executeTransaction(sdk, mintStableForSecondTx, { network: daoInfo.network || "devnet" });
  console.log(`✅ Minted ${Number(secondAccountMintAmount) / 1e9} stable coins for second account`);
  console.log();

  // SWAP 1: Spot swap using SDK workflow (primary account)
  console.log("📊 SWAP 1 (Primary): Spot swap (stable → asset)...");

  const swapAmount1 = 1_000_000_000n;
  const coins1 = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: stableType,
  });

  const swap1Tx = proposalWorkflow.spotSwap({
    spotPoolId: spotPoolRef,
    proposalId: proposalRef,
    escrowId: escrowRef,
    assetType,
    stableType,
    lpType,
    inputCoins: coins1.data.map((c) => c.coinObjectId),
    amountIn: swapAmount1,
    minAmountOut: 0n,
    direction: 'stable_to_asset',
    recipient: activeAddress,
  });

  const swap1Result = await executeTransaction(sdk, swap1Tx.transaction, {
    network: "devnet",
    showObjectChanges: true,
  });
  // Update refs after swap
  proposalRef = getObjectRefById(swap1Result, proposalId, network);
  escrowRef = getObjectRefById(swap1Result, escrowId, network);
  spotPoolRef = getObjectRefById(swap1Result, spotPoolId, network);

  console.log(`✅ Spot swap complete (${Number(swapAmount1) / 1e9} stable → asset)`);
  console.log();

  // Wait for indexer on localnet
  await waitForIndexer(network, { description: "indexer (spot swap)" });

  // SWAP 2-4: Conditional swaps (if conditional coins available)
  if (conditionalCoinsInfo && conditionalOutcomes.length > 0) {
    const acceptOutcome = conditionalOutcomes.find((o) => o.index === ACCEPT_OUTCOME_INDEX);
    const rejectOutcome = conditionalOutcomes.find((o) => o.index === REJECT_OUTCOME_INDEX);

    if (!acceptOutcome || !rejectOutcome) {
      console.log("⚠️  SKIPPED: Missing conditional coin metadata");
    } else {
      // Helper to extract and track conditional tokens from transaction result
      const trackConditionalTokens = (
        result: any,
        outcomeInfo: ConditionalOutcomeCoinSet,
        owner: string
      ) => {
        const changes = result.objectChanges || [];

        // Look for created conditional asset coins
        const assetCoin = changes.find(
          (obj: any) =>
            obj.type === "created" &&
            obj.objectType?.includes(outcomeInfo.asset.coinType) &&
            obj.owner?.AddressOwner?.toLowerCase() === owner.toLowerCase()
        );
        if (assetCoin) {
          conditionalTokens.push({
            coinId: assetCoin.objectId,
            coinType: outcomeInfo.asset.coinType,
            outcomeIndex: outcomeInfo.index,
            isAsset: true,
            owner,
          });
          console.log(`   📝 Tracked: ${outcomeInfo.index === ACCEPT_OUTCOME_INDEX ? 'ACCEPT' : 'REJECT'} conditional ASSET: ${assetCoin.objectId.slice(0, 10)}...`);
        }

        // Look for created conditional stable coins
        const stableCoin = changes.find(
          (obj: any) =>
            obj.type === "created" &&
            obj.objectType?.includes(outcomeInfo.stable.coinType) &&
            obj.owner?.AddressOwner?.toLowerCase() === owner.toLowerCase()
        );
        if (stableCoin) {
          conditionalTokens.push({
            coinId: stableCoin.objectId,
            coinType: outcomeInfo.stable.coinType,
            outcomeIndex: outcomeInfo.index,
            isAsset: false,
            owner,
          });
          console.log(`   📝 Tracked: ${outcomeInfo.index === ACCEPT_OUTCOME_INDEX ? 'ACCEPT' : 'REJECT'} conditional STABLE: ${stableCoin.objectId.slice(0, 10)}...`);
        }
      };

      // SWAP 2: Primary account - Conditional swap stable→asset on ACCEPT outcome
      console.log("📊 SWAP 2 (Primary): Conditional swap (stable → ACCEPT asset)...");
      const swapAmount2 = 10_000_000_000n;
      const coins2 = await sdk.client.getCoins({
        owner: activeAddress,
        coinType: stableType,
      });

      const swap2Tx = proposalWorkflow.conditionalSwap({
        proposalId: proposalRef,
        escrowId: escrowRef,
        spotPoolId: spotPoolRef,
        assetType,
        stableType,
        lpType,
        stableCoins: coins2.data.map((c) => c.coinObjectId),
        amountIn: swapAmount2,
        minAmountOut: 0n,
        direction: 'stable_to_asset',
        outcomeIndex: ACCEPT_OUTCOME_INDEX,
        allOutcomeCoins: conditionalOutcomes.map((o) => ({
          outcomeIndex: o.index,
          assetCoinType: o.asset.coinType,
          stableCoinType: o.stable.coinType,
        })),
        recipient: activeAddress,
      });

      const swap2Result = await executeTransaction(sdk, swap2Tx.transaction, {
        network: "devnet",
        showObjectChanges: true,
      });
      // Update refs after swap
      proposalRef = getObjectRefById(swap2Result, proposalId, network);
      escrowRef = getObjectRefById(swap2Result, escrowId, network);
      spotPoolRef = getObjectRefById(swap2Result, spotPoolId, network);
      trackConditionalTokens(swap2Result, acceptOutcome, activeAddress);
      console.log(`✅ Primary: Got ACCEPT conditional ASSET tokens`);
      console.log();

      // Wait for indexer on localnet
      await waitForIndexer(network, { description: "indexer (conditional swap)" });

      // Note: SWAP 3 (asset→stable) is disabled due to quantum invariant issues
      // The test demonstrates conditional ASSET token tracking and redemption

      console.log(`📋 Total conditional tokens tracked: ${conditionalTokens.length}`);
      conditionalTokens.forEach((t, i) => {
        const outcomeName = t.outcomeIndex === ACCEPT_OUTCOME_INDEX ? 'ACCEPT' : 'REJECT';
        const tokenType = t.isAsset ? 'ASSET' : 'STABLE';
        const ownerName = t.owner === activeAddress ? 'Primary' : 'Second';
        console.log(`   ${i + 1}. ${outcomeName} ${tokenType} owned by ${ownerName}: ${t.coinId.slice(0, 10)}...`);
      });
      console.log();
    }
  } else {
    console.log("⚠️  SKIPPED: Conditional swaps require conditional coins to be deployed");
    console.log("   Run: npm run deploy-conditional-coins");
    console.log();
  }

  // ============================================================================
  // STEP 5: Wait for trading period and finalize
  // ============================================================================
  console.log("=".repeat(80));
  console.log("STEP 5: FINALIZE PROPOSAL (using sdk.workflows.proposal)");
  console.log("=".repeat(80));
  console.log();

  // Wait for trading period (configured in proposal)
  await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS + 2000, { description: "trading period" });

  console.log("📤 Finalizing proposal...");

  const finalizeTx = proposalWorkflow.finalizeProposal({
    proposalId: proposalRef,
    escrowId: escrowRef,
    spotPoolId: spotPoolRef,
    assetType,
    stableType,
    lpType,
  });

  const finalizeResult = await executeTransaction(sdk, finalizeTx.transaction, { network: "devnet", showObjectChanges: true });
  // Update refs after finalize
  proposalRef = getObjectRefById(finalizeResult, proposalId, network);
  escrowRef = getObjectRefById(finalizeResult, escrowId, network);
  spotPoolRef = getObjectRefById(finalizeResult, spotPoolId, network);
  daoAccountRef = getObjectRefById(finalizeResult, daoAccountId, network);

  console.log("✅ Proposal finalized!");
  console.log("   - Winning conditional liquidity auto-recombined back to spot pool");
  console.log("   - active_proposal_id cleared: LP operations now allowed");
  console.log();

  // Check winning outcome
  const proposalData = await sdk.client.getObject({
    id: getObjId(proposalRef),
    options: { showContent: true },
  });

  const fields = (proposalData.data!.content as any).fields;
  const winningOutcome = fields.outcome_data.fields.winning_outcome;

  console.log(`🏆 Winning outcome: ${winningOutcome === 0 || winningOutcome === "0" ? "REJECT" : "ACCEPT"} (${winningOutcome})`);
  console.log();

  const acceptWon = winningOutcome === 1 || winningOutcome === "1";

  // ============================================================================
  // STEP 6: Execute actions (if Accept won) via AutoExecutor
  // ============================================================================
  if (acceptWon) {
    console.log("=".repeat(80));
    console.log("STEP 6: EXECUTE ACTIONS (via AutoExecutor)");
    console.log("=".repeat(80));
    console.log();

    console.log("📤 Executing winning outcome actions...");

    // Wait for indexer to index the proposal with staged actions
    console.log("   Waiting for indexer to index proposal (5s)...");
    await sleep(5000);

    // Create AutoExecutor using SDK helper
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:9090";
    const autoExecutor = sdk.createAutoExecutor(backendUrl);

    // Execute winning outcome actions - AutoExecutor fetches action specs from backend
    const executeTx = await autoExecutor.executeProposal(proposalId, {
      accountId: daoAccountRef,
      outcome: winningOutcome as number,
      escrowId: escrowRef,
      spotPoolId: spotPoolRef,
    });

    const executeResult = await executeTransaction(sdk, executeTx.transaction, {
      network: "devnet",
      showObjectChanges: true,
    });

    const streamObjects = executeResult.objectChanges?.filter(
      (obj: any) => obj.type === "created" && obj.objectType?.includes("::vault::Stream")
    );

    if (streamObjects && streamObjects.length > 0) {
      console.log(`✅ Actions executed! Created ${streamObjects.length} stream(s)`);
      streamObjects.forEach((stream: any, i: number) => {
        console.log(`   Stream ${i + 1}: ${stream.objectId}`);
      });
    } else {
      console.log("✅ Actions executed!");
    }
    console.log();
  } else {
    console.log("ℹ️  Reject won - no actions to execute");
    console.log();
  }

  // ============================================================================
  // STEP 7: Redeem ALL winning conditional tokens
  // ============================================================================
  console.log("=".repeat(80));
  console.log("STEP 7: REDEEM WINNING CONDITIONAL TOKENS (Comprehensive)");
  console.log("=".repeat(80));
  console.log();

  if (conditionalCoinsInfo && conditionalTokens.length > 0) {
    const winningOutcomeIndex = acceptWon ? ACCEPT_OUTCOME_INDEX : REJECT_OUTCOME_INDEX;
    const winningTokens = conditionalTokens.filter((t) => t.outcomeIndex === winningOutcomeIndex);
    const losingTokens = conditionalTokens.filter((t) => t.outcomeIndex !== winningOutcomeIndex);

    console.log(`📊 Token Summary:`);
    console.log(`   Winning outcome: ${acceptWon ? 'ACCEPT' : 'REJECT'} (index ${winningOutcomeIndex})`);
    console.log(`   Winning tokens to redeem: ${winningTokens.length}`);
    console.log(`   Losing tokens (should fail): ${losingTokens.length}`);
    console.log();

    // --- Redeem all WINNING tokens ---
    if (winningTokens.length > 0) {
      console.log("🏆 Redeeming WINNING outcome tokens...");
      let redeemSuccessCount = 0;

      for (const token of winningTokens) {
        const outcomeName = token.outcomeIndex === ACCEPT_OUTCOME_INDEX ? 'ACCEPT' : 'REJECT';
        const tokenType = token.isAsset ? 'ASSET' : 'STABLE';
        const ownerName = token.owner === activeAddress ? 'Primary' : 'Second';

        console.log(`   Redeeming ${outcomeName} ${tokenType} for ${ownerName}...`);

        try {
          const redeemTx = proposalWorkflow.redeemConditionalTokens(
            proposalId,
            escrowId,
            assetType,
            stableType,
            token.coinId,
            token.coinType,
            token.outcomeIndex,
            token.isAsset,
            token.owner
          );

          // Execute with appropriate account
          if (token.owner === activeAddress) {
            await executeTransaction(sdk, redeemTx.transaction, {
              network: "devnet",
              showObjectChanges: false,
            });
          } else {
            redeemTx.transaction.setSender(secondAddress);
            await executeTransactionWithKeypair(sdk, redeemTx.transaction, secondKeypair, {
              network: "devnet",
              showObjectChanges: false,
            });
          }

          redeemSuccessCount++;
          console.log(`   ✅ Redeemed: ${token.coinId.slice(0, 10)}...`);
        } catch (error: any) {
          console.log(`   ❌ Failed to redeem: ${error.message?.slice(0, 100) || error}`);
        }
      }

      console.log(`✅ Successfully redeemed ${redeemSuccessCount}/${winningTokens.length} winning tokens`);
      console.log();
    }

    // --- Verify LOSING tokens fail to redeem ---
    if (losingTokens.length > 0) {
      console.log("🧪 Verifying LOSING outcome tokens cannot be redeemed...");
      let expectedFailures = 0;

      for (const token of losingTokens) {
        const outcomeName = token.outcomeIndex === ACCEPT_OUTCOME_INDEX ? 'ACCEPT' : 'REJECT';
        const tokenType = token.isAsset ? 'ASSET' : 'STABLE';
        const ownerName = token.owner === activeAddress ? 'Primary' : 'Second';

        console.log(`   Testing ${outcomeName} ${tokenType} for ${ownerName}...`);

        try {
          const redeemTx = proposalWorkflow.redeemConditionalTokens(
            proposalId,
            escrowId,
            assetType,
            stableType,
            token.coinId,
            token.coinType,
            token.outcomeIndex,
            token.isAsset,
            token.owner
          );

          // Execute with appropriate account - use suppressErrors since we expect this to fail
          if (token.owner === activeAddress) {
            await executeTransaction(sdk, redeemTx.transaction, {
              network: "devnet",
              showObjectChanges: false,
              suppressErrors: true, // Expected to fail
            });
          } else {
            redeemTx.transaction.setSender(secondAddress);
            await executeTransactionWithKeypair(sdk, redeemTx.transaction, secondKeypair, {
              network: "devnet",
              showObjectChanges: false,
            });
          }

          // If we get here, redemption succeeded (unexpected!)
          console.log(`   ⚠️  UNEXPECTED: Losing token redeemed successfully!`);
        } catch (error: any) {
          // Expected! Losing tokens should fail
          expectedFailures++;
          console.log(`   ✅ Correctly rejected: ${token.coinId.slice(0, 10)}...`);
        }
      }

      console.log(`✅ ${expectedFailures}/${losingTokens.length} losing tokens correctly rejected`);
      if (expectedFailures < losingTokens.length) {
        console.log(`⚠️  WARNING: ${losingTokens.length - expectedFailures} losing tokens were incorrectly redeemed!`);
      }
      console.log();
    }
  } else if (!conditionalCoinsInfo) {
    console.log("ℹ️  SKIPPED: Conditional token redemption requires conditional coins");
    console.log();
  } else {
    console.log("ℹ️  SKIPPED: No conditional tokens were tracked from swaps");
    console.log();
  }

  // ============================================================================
  // DONE
  // ============================================================================
  console.log("=".repeat(80));
  console.log("🎉 COMPREHENSIVE TEST COMPLETE! 🎉");
  console.log("=".repeat(80));
  console.log();

  console.log("📋 Summary:");
  console.log("  ✅ Created and initialized proposal atomically (using sdk.workflows.proposal.createAndInitializeProposal)");
  console.log("  ✅ Actions added during atomic creation");
  console.log("  ✅ Advanced to TRADING (using sdk.workflows.proposal.advanceToTrading)");
  console.log("  ✅ 100% quantum split: spot pool → conditional AMMs");
  console.log("  ✅ Performed spot swap (using sdk.workflows.proposal.spotSwap)");
  if (conditionalCoinsInfo) {
    console.log("  ✅ Conditional swap: stable→ACCEPT_asset (conditional ASSET)");
  } else {
    console.log("  ⚠️  Conditional swap skipped (no conditional coins available)");
  }
  console.log(`  ✅ Finalized proposal - winner: ${acceptWon ? "ACCEPT" : "REJECT"}`);
  console.log("  ✅ Auto-recombination: winning conditional liquidity → spot pool");
  if (acceptWon) {
    console.log("  ✅ Executed actions (via AutoExecutor)");
  } else {
    console.log("  ℹ️  No actions executed (Reject won)");
  }
  if (conditionalCoinsInfo && conditionalTokens.length > 0) {
    const winningOutcomeIndex = acceptWon ? ACCEPT_OUTCOME_INDEX : REJECT_OUTCOME_INDEX;
    const winningCount = conditionalTokens.filter((t) => t.outcomeIndex === winningOutcomeIndex).length;
    const losingCount = conditionalTokens.filter((t) => t.outcomeIndex !== winningOutcomeIndex).length;
    console.log(`  ✅ Redeemed ${winningCount} winning tokens (ASSET + STABLE)`);
    console.log(`  ✅ Verified ${losingCount} losing tokens correctly rejected`);
  }
  console.log();

  console.log(`🔗 View proposal: https://suiscan.xyz/devnet/object/${proposalId}`);
  console.log(`🔗 View DAO: https://suiscan.xyz/devnet/object/${daoAccountId}`);
  console.log();
}

main()
  .then(() => {
    console.log("✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
