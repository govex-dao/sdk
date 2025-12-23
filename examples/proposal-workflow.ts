/**
 * Example: Proposal Workflow
 *
 * This example demonstrates the complete proposal lifecycle:
 * 1. Creating a proposal with outcomes
 * 2. Adding actions to outcomes
 * 3. Advancing through states (PREMARKET -> REVIEW -> TRADING)
 * 4. Trading on conditional markets
 * 5. Finalizing the proposal
 * 6. Executing winning actions
 * 7. Redeeming conditional tokens
 */

import { Transaction } from "@mysten/sui/transactions";
import { FutarchySDK } from "../src";

// Example configuration (replace with your actual values)
const CONFIG = {
  DAO_ACCOUNT_ID: "0xYOUR_DAO_ACCOUNT_ID",
  ASSET_TYPE: "0xYOUR_PACKAGE::coin::ASSET",
  STABLE_TYPE: "0xYOUR_PACKAGE::coin::STABLE",
  LP_TYPE: "0xYOUR_PACKAGE::pool::LP",
  SPOT_POOL_ID: "0xYOUR_SPOT_POOL_ID",

  // Conditional coins registry (from deploy-conditional-coins)
  REGISTRY_ID: "0xYOUR_REGISTRY_ID",
  CONDITIONAL_COINS: [
    {
      outcomeIndex: 0,
      assetCoinType: "0x...::cond0_asset::COND0_ASSET",
      assetCapId: "0x...",
      stableCoinType: "0x...::cond0_stable::COND0_STABLE",
      stableCapId: "0x...",
    },
    {
      outcomeIndex: 1,
      assetCoinType: "0x...::cond1_asset::COND1_ASSET",
      assetCapId: "0x...",
      stableCoinType: "0x...::cond1_stable::COND1_STABLE",
      stableCapId: "0x...",
    },
  ],
};

async function main() {
  // Initialize SDK
  const sdk = new FutarchySDK({
    network: "devnet",
  });

  console.log("✅ SDK initialized");
  console.log("Network:", sdk.network.network);

  const proposalWorkflow = sdk.workflows.proposal;
  const registryId = sdk.deployments.getSharedObject(
    "AccountProtocol",
    "PackageRegistry"
  )!.objectId;

  // ===== STEP 1: Create Proposal =====

  console.log("\n📝 Creating proposal...");

  const createResult = proposalWorkflow.createProposal({
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    title: "Example Governance Proposal",
    introductionDetails: "This proposal demonstrates the futarchy governance flow",
    metadata: JSON.stringify({
      category: "governance",
      version: "1.0",
    }),
    outcomeMessages: ["Reject this proposal", "Accept this proposal"],
    outcomeDetails: [
      "Status quo - no changes",
      "Execute the proposed actions",
    ],
    feeAmount: BigInt(10_000_000), // 0.01 stable
    conditionalCoinsRegistry: {
      registryId: CONFIG.REGISTRY_ID,
      coinSets: CONFIG.CONDITIONAL_COINS,
    },
  });

  console.log("Transaction created for proposal creation");
  console.log("Intent type:", createResult.intentType);

  // NOTE: Execute transaction to get proposalId
  // const result = await executeTransaction(sdk, createResult.transaction);
  // const proposalId = extractProposalId(result);

  // ===== STEP 2: Add Actions to Accept Outcome =====

  console.log("\n⚙️ Adding actions to Accept outcome...");

  const EXAMPLE_PROPOSAL_ID = "0xPROPOSAL_ID";
  const ACCEPT_OUTCOME_INDEX = 1;

  // Add a memo action
  const addMemoResult = proposalWorkflow.addActionsToOutcome({
    proposalId: EXAMPLE_PROPOSAL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    outcomeIndex: ACCEPT_OUTCOME_INDEX,
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    registryId,
    actions: [
      {
        type: "memo",
        message: "This memo was executed via governance!",
      },
    ],
  });

  console.log("Memo action added");

  // Add a stream action (payment stream from treasury)
  const addStreamResult = proposalWorkflow.addActionsToOutcome({
    proposalId: EXAMPLE_PROPOSAL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    outcomeIndex: ACCEPT_OUTCOME_INDEX,
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    registryId,
    actions: [
      {
        type: "create_stream",
        coinType: CONFIG.STABLE_TYPE,
        vaultName: "treasury",
        beneficiary: "0xBENEFICIARY_ADDRESS",
        amountPerIteration: BigInt(1_000_000),
        startTime: BigInt(Date.now() + 86400000), // Start in 1 day
        iterationsTotal: BigInt(12), // 12 payments
        iterationPeriodMs: BigInt(2592000000), // Monthly
        maxPerWithdrawal: BigInt(1_000_000),
      },
    ],
  });

  console.log("Stream action added");

  // ===== STEP 3: Advance to REVIEW =====

  console.log("\n🔄 Advancing to REVIEW state...");

  const advanceToReviewResult = proposalWorkflow.advanceToReview({
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    proposalId: EXAMPLE_PROPOSAL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    conditionalCoinsRegistry: {
      registryId: CONFIG.REGISTRY_ID,
      coinSets: CONFIG.CONDITIONAL_COINS,
    },
  });

  console.log("Advance to REVIEW transaction created");
  // This creates TokenEscrow and conditional markets
  // Extract escrowId from result.objectChanges

  // ===== STEP 4: Advance to TRADING =====

  console.log("\n⏰ After review period, advance to TRADING...");

  const EXAMPLE_ESCROW_ID = "0xESCROW_ID";

  const advanceToTradingResult = proposalWorkflow.advanceState({
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
  });

  console.log("Advance to TRADING transaction created");

  // ===== STEP 5: Trade on Conditional Markets =====

  console.log("\n💱 Trading on conditional markets...");

  // Buy ACCEPT tokens (outcome index 1)
  const buyAcceptResult = proposalWorkflow.conditionalSwap({
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    outcomeIndex: ACCEPT_OUTCOME_INDEX,
    assetConditionalType: CONFIG.CONDITIONAL_COINS[1].assetCoinType,
    stableConditionalType: CONFIG.CONDITIONAL_COINS[1].stableCoinType,
    direction: "buy_asset", // Buy conditional asset tokens
    stableAmount: BigInt(100_000_000), // 0.1 stable
  });

  console.log("Buy ACCEPT tokens transaction created");

  // Sell REJECT tokens (outcome index 0)
  const sellRejectResult = proposalWorkflow.conditionalSwap({
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    outcomeIndex: 0,
    assetConditionalType: CONFIG.CONDITIONAL_COINS[0].assetCoinType,
    stableConditionalType: CONFIG.CONDITIONAL_COINS[0].stableCoinType,
    direction: "sell_asset", // Sell conditional asset tokens
    assetAmount: BigInt(50_000_000),
  });

  console.log("Sell REJECT tokens transaction created");

  // ===== STEP 6: Finalize Proposal =====

  console.log("\n🏁 After trading period, finalize proposal...");

  const finalizeResult = proposalWorkflow.finalize({
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
  });

  console.log("Finalize transaction created");
  // Check ProposalFinalized event for winning_outcome

  // ===== STEP 7: Execute Actions (if Accept won) =====

  console.log("\n⚡ Executing winning actions...");

  const executeActionsResult = proposalWorkflow.executeActions({
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    actionTypes: [
      { type: "memo" },
      {
        type: "create_stream",
        coinType: CONFIG.STABLE_TYPE,
        vaultName: "treasury",
      },
    ],
  });

  console.log("Execute actions transaction created");

  // ===== STEP 8: Redeem Winning Tokens =====

  console.log("\n💰 Redeeming winning conditional tokens...");

  // Redeem ACCEPT tokens (assuming Accept won)
  const redeemResult = proposalWorkflow.redeemConditionalTokens({
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    conditionalCoinType: CONFIG.CONDITIONAL_COINS[1].assetCoinType,
    conditionalCoinIds: ["0xCOND_TOKEN_1", "0xCOND_TOKEN_2"],
    outcomeIndex: ACCEPT_OUTCOME_INDEX,
    isAsset: true,
  });

  console.log("Redeem tokens transaction created");

  // ===== Query Proposal State =====

  console.log("\n🔍 Querying proposal data...");

  const factoryPackageId = sdk.getPackageId("futarchy_factory")!;
  const allProposals = await sdk.query.getAllProposals(
    factoryPackageId,
    CONFIG.DAO_ACCOUNT_ID
  );

  console.log(`\nFound ${allProposals.length} proposals for this DAO`);

  if (allProposals.length > 0) {
    const latest = allProposals[allProposals.length - 1];
    console.log("\nLatest Proposal:");
    console.log("  Proposal ID:", latest.proposal_id);
    console.log("  Title:", latest.title);
    console.log("  Status:", latest.status);
    console.log("  Creator:", latest.creator);
    console.log("  Outcome Count:", latest.outcome_count);
  }

  console.log("\n✅ Proposal workflow example complete!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
