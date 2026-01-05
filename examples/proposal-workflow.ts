/**
 * Example: Proposal Workflow
 *
 * This example demonstrates the complete proposal lifecycle:
 * 1. Creating and initializing a proposal atomically (with actions)
 * 2. Advancing from REVIEW to TRADING state
 * 3. Trading on conditional markets
 * 4. Finalizing the proposal
 * 5. Executing winning actions
 * 6. Redeeming conditional tokens
 *
 * The new atomic flow combines proposal creation, action addition,
 * and initialization into a single transaction for better UX.
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
  BASE_STABLE_METADATA_ID: "0xYOUR_STABLE_METADATA",

  // Conditional coins registry (from deploy-conditional-coins)
  // Module names follow pattern: conditional_N where N = (outcome_index * 2) for asset, (outcome_index * 2 + 1) for stable
  REGISTRY_ID: "0xYOUR_REGISTRY_ID",
  CONDITIONAL_COINS: [
    {
      outcomeIndex: 0,
      assetCoinType: "0x...::conditional_0::CONDITIONAL_0",
      assetCapId: "0x...",
      stableCoinType: "0x...::conditional_1::CONDITIONAL_1",
      stableCapId: "0x...",
    },
    {
      outcomeIndex: 1,
      assetCoinType: "0x...::conditional_2::CONDITIONAL_2",
      assetCapId: "0x...",
      stableCoinType: "0x...::conditional_3::CONDITIONAL_3",
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
  const registryId = sdk.deployments.getPackageRegistry()!.objectId;

  // ===== STEP 1: Create and Initialize Proposal Atomically =====

  console.log("\n📝 Creating and initializing proposal atomically...");
  console.log("This combines proposal creation, action addition, and initialization.");

  const ACCEPT_OUTCOME_INDEX = 1;
  const activeAddress = "0xYOUR_ADDRESS";

  const createResult = proposalWorkflow.createAndInitializeProposal({
    // CreateProposalConfig
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    title: "Example Governance Proposal",
    introduction: "This proposal demonstrates the futarchy governance flow",
    metadata: JSON.stringify({
      category: "governance",
      version: "1.0",
    }),
    outcomeMessages: ["Reject this proposal", "Accept this proposal"],
    outcomeDetails: [
      "Status quo - no changes",
      "Execute the proposed actions",
    ],
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: ["0xFEE_COIN_ID"],
    feeAmount: BigInt(10_000_000), // 0.01 stable

    // Actions to add to Accept outcome (before finalization)
    outcomeActions: [
      {
        outcomeIndex: ACCEPT_OUTCOME_INDEX,
        actions: [
          {
            type: "memo",
            message: "This memo was executed via governance!",
          },
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
      },
    ],
    registryId,

    // AdvanceToReviewConfig
    lpType: CONFIG.LP_TYPE,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    senderAddress: activeAddress,
    baseStableMetadataId: CONFIG.BASE_STABLE_METADATA_ID,
    conditionalCoinsRegistry: {
      registryId: CONFIG.REGISTRY_ID,
      coinSets: CONFIG.CONDITIONAL_COINS,
    },
  });

  console.log("Transaction created for atomic proposal creation + initialization");
  console.log("Description:", createResult.description);

  // NOTE: Execute transaction to get proposalId and escrowId
  // const result = await executeTransaction(sdk, createResult.transaction);
  // const proposalId = extractProposalId(result);
  // const escrowId = extractEscrowId(result);

  const EXAMPLE_PROPOSAL_ID = "0xPROPOSAL_ID";
  const EXAMPLE_ESCROW_ID = "0xESCROW_ID";

  // ===== STEP 2: Advance to TRADING =====

  console.log("\n⏰ After review period, advance to TRADING...");

  const advanceToTradingResult = proposalWorkflow.advanceToTrading({
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    senderAddress: activeAddress,
    // Gap fee is optional - only needed if less than 12 hours since last proposal
    // gapFeeCoins: ['0xCOIN_ID'],
    // maxGapFee: 1_000_000_000n,
    // feeInAsset: false,  // true for asset token, false for stable token
  });

  console.log("Advance to TRADING transaction created");

  // ===== STEP 3: Trade on Conditional Markets =====

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
    direction: "stable_to_asset", // Buy conditional asset tokens
    amountIn: BigInt(100_000_000), // 0.1 stable
    minAmountOut: BigInt(0),
    recipient: activeAddress,
    allOutcomeCoins: CONFIG.CONDITIONAL_COINS.map((c) => ({
      outcomeIndex: c.outcomeIndex,
      assetCoinType: c.assetCoinType,
      stableCoinType: c.stableCoinType,
    })),
    stableCoins: ["0xSTABLE_COIN_ID"],
  });

  console.log("Buy ACCEPT tokens transaction created");

  // ===== STEP 4: Finalize Proposal =====

  console.log("\n🏁 After trading period, finalize proposal...");

  const finalizeResult = proposalWorkflow.finalizeProposal({
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

  // ===== STEP 5: Execute Actions (if Accept won) =====

  console.log("\n⚡ Executing winning actions...");

  const executeActionsResult = proposalWorkflow.executeActions({
    daoAccountId: CONFIG.DAO_ACCOUNT_ID,
    proposalId: EXAMPLE_PROPOSAL_ID,
    escrowId: EXAMPLE_ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    actionTypes: [
      { type: "memo" },
      { type: "create_stream", coinType: CONFIG.STABLE_TYPE },
    ],
  });

  console.log("Execute actions transaction created");

  // ===== STEP 6: Redeem Winning Tokens =====

  console.log("\n💰 Redeeming winning conditional tokens...");

  // Redeem ACCEPT tokens (assuming Accept won)
  const redeemResult = proposalWorkflow.redeemConditionalTokens(
    EXAMPLE_PROPOSAL_ID,
    EXAMPLE_ESCROW_ID,
    CONFIG.ASSET_TYPE,
    CONFIG.STABLE_TYPE,
    "0xCOND_TOKEN_ID",
    CONFIG.CONDITIONAL_COINS[1].assetCoinType,
    ACCEPT_OUTCOME_INDEX,
    true, // isAsset
    activeAddress
  );

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
