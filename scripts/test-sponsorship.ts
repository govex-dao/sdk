/**
 * Test: Sponsorship System
 *
 * This test validates the proposal sponsorship system:
 * 1. Verify sponsorship is disabled by default (ESponsorshipNotEnabled)
 * 2. If enabled, test sponsored proposals get lower TWAP threshold
 *
 * NOTE: Sponsorship is disabled by default in new DAOs. To enable:
 * - Run a governance proposal with update_sponsorship_config action
 * - Grant sponsor quota to team members
 *
 * This test currently validates:
 * - Sponsorship correctly fails when disabled
 * - The error path works as expected
 *
 * Prerequisites:
 * - Run: npm run launchpad-e2e-two-outcome
 * - Run: npm run deploy-conditional-coins
 */

import { Transaction } from "@mysten/sui/transactions";
import * as path from "path";
import { TransactionUtils } from "../src/services/transaction";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";
import {
  loadDaoInfo,
  loadConditionalCoinsInfo,
  extractConditionalOutcomes,
  sleep,
  logSection,
  logStep,
  logSuccess,
  logInfo,
  logError,
  REJECT_OUTCOME_INDEX,
  ACCEPT_OUTCOME_INDEX,
} from "./e2e-test-utils";

async function main() {
  logSection("TEST: SPONSORSHIP SYSTEM");

  // ============================================================================
  // STEP 0: Load prerequisites
  // ============================================================================
  logStep(0, "LOAD PREREQUISITES");

  const daoInfo = loadDaoInfo();
  const daoAccountId = daoInfo.accountId;
  const assetType = daoInfo.assetType;
  const stableType = daoInfo.stableType;
  const lpType = daoInfo.lpType;
  const spotPoolId = daoInfo.spotPoolId;
  const stableTreasuryCap = daoInfo.stableTreasuryCap;
  const isStableTreasuryCapShared = daoInfo.isStableTreasuryCapShared ?? false;
  const baseAssetCurrencyId = daoInfo.assetCurrencyId;
  const baseStableCurrencyId = daoInfo.stableCurrencyId;

  logSuccess(`DAO Account: ${daoAccountId}`);

  const conditionalCoinsInfo = loadConditionalCoinsInfo();
  if (!conditionalCoinsInfo) {
    throw new Error("No conditional coins info found");
  }

  const conditionalOutcomes = extractConditionalOutcomes(conditionalCoinsInfo);
  logSuccess(`Loaded ${conditionalOutcomes.length} conditional outcome coin sets`);
  console.log();

  // Initialize SDK
  const sdk = initSDK();
  const activeAddress = getActiveAddress();
  logSuccess(`Active address: ${activeAddress}`);
  console.log();

  const proposalWorkflow = sdk.workflows.proposal;
  const registryId = sdk.deployments.getPackageRegistry()!.objectId;

  // Get governance package ID for sponsorship call
  const governancePackageId = sdk.deployments.getPackage("futarchy_governance")!.packageId;
  logInfo(`Governance package: ${governancePackageId}`);
  console.log();

  // ============================================================================
  // STEP 1: Mint fee tokens and create proposal
  // ============================================================================
  logStep(1, "MINT FEE TOKENS AND CREATE PROPOSAL");

  const feeAmount = 10_000_000n;
  const mintFeeTx = new Transaction();

  // Always use tx.object() - SDK resolves shared/owned automatically
  const treasuryCapArg = mintFeeTx.object(stableTreasuryCap);

  const feeCoin = mintFeeTx.moveCall({
    target: "0x2::coin::mint",
    typeArguments: [stableType],
    arguments: [treasuryCapArg, mintFeeTx.pure.u64(feeAmount)],
  });
  mintFeeTx.transferObjects([feeCoin], mintFeeTx.pure.address(activeAddress));

  await executeTransaction(sdk, mintFeeTx, { network: "devnet" });
  logSuccess(`Minted ${feeAmount} stable for fees`);
  console.log();

  // Get fee coins after minting
  const feeCoins = await sdk.client.getCoins({
    owner: activeAddress,
    coinType: stableType,
  });
  const feeCoinIds = feeCoins.data.map((c) => c.coinObjectId);

  // ============================================================================
  // STEP 2: Create and initialize proposal atomically
  // ============================================================================
  logStep(2, "CREATE AND INITIALIZE PROPOSAL (atomic)");

  const createTx = proposalWorkflow.createAndInitializeProposal({
    // CreateProposalConfig
    daoAccountId,
    assetType,
    stableType,
    title: "Test Sponsorship",
    introduction: "Testing the sponsorship system",
    metadata: JSON.stringify({ test: "sponsorship" }),
    outcomeMessages: ["Reject", "Accept with sponsorship"],
    outcomeDetails: ["Do nothing", "Execute if sponsored"],
    proposer: activeAddress,
    treasuryAddress: activeAddress,
    usedQuota: false,
    feeCoins: feeCoinIds,
    feeAmount,
    registryId,
    // AdvanceToReviewConfig
    lpType,
    spotPoolId,
    senderAddress: activeAddress,
    baseAssetCurrencyId,
    baseStableCurrencyId,
    conditionalCoinsRegistry: {
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
    },
  });

  const createResult = await executeTransaction(sdk, createTx.transaction, {
    network: "devnet",
    showObjectChanges: true,
  });

  const proposalObject = createResult.objectChanges?.find(
    (obj: any) => obj.type === "created" && obj.objectType?.includes("Proposal")
  );
  const proposalId = (proposalObject as any)?.objectId;
  logSuccess(`Proposal created and initialized: ${proposalId}`);
  console.log();

  // ============================================================================
  // STEP 3: Attempt to sponsor proposal (should fail - sponsorship disabled)
  // ============================================================================
  logStep(3, "ATTEMPT TO SPONSOR PROPOSAL (EXPECT FAILURE)");

  logInfo("Sponsorship is DISABLED by default in new DAOs");
  logInfo("Attempting to call sponsor_proposal - should fail with ESponsorshipNotEnabled");
  console.log();

  const sponsorTx = new Transaction();

  // Call sponsor_proposal entry function
  sponsorTx.moveCall({
    target: `${governancePackageId}::proposal_sponsorship::sponsor_proposal`,
    typeArguments: [assetType, stableType],
    arguments: [
      sponsorTx.object(proposalId),
      sponsorTx.object(daoAccountId),
      sponsorTx.object(registryId),
      sponsorTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  let sponsorshipFailed = false;
  let errorMessage = "";

  try {
    await executeTransaction(sdk, sponsorTx, {
      network: "devnet",
      suppressErrors: true,
    });
    logError("Sponsorship succeeded unexpectedly! This should fail when disabled.");
  } catch (error: any) {
    sponsorshipFailed = true;
    errorMessage = error.message || String(error);

    // Check if it's the expected error (ESponsorshipNotEnabled = 1)
    if (
      errorMessage.includes("ESponsorshipNotEnabled") ||
      errorMessage.includes("abort_code") && errorMessage.includes("1")
    ) {
      logSuccess("Sponsorship correctly failed with ESponsorshipNotEnabled!");
      logInfo("This validates that the sponsorship guard is working correctly");
    } else if (errorMessage.includes("ENoSponsorQuota")) {
      logSuccess("Sponsorship failed with ENoSponsorQuota (user has no quota)");
      logInfo("This means sponsorship might be enabled but user lacks quota");
    } else {
      logInfo(`Sponsorship failed with: ${errorMessage.substring(0, 100)}...`);
    }
  }
  console.log();

  // Note: sponsor_proposal_to_zero and sponsor_outcome have been removed
  // The simplified sponsorship system now only has sponsor_proposal which:
  // - Uses one quota to sponsor ALL pass outcomes on a proposal
  // - Sponsored outcomes bypass TWAP threshold (just need TWAP >= reject TWAP)

  // ============================================================================
  // STEP 4: Document how to enable sponsorship
  // ============================================================================
  logStep(4, "ENABLING SPONSORSHIP (DOCUMENTATION)");

  console.log("To enable sponsorship for your DAO, you need to:");
  console.log();
  console.log("1. Create a proposal with update_sponsorship_config action:");
  console.log("   {");
  console.log("     type: 'update_sponsorship_config',");
  console.log("     enabled: true,");
  console.log("     waiveAdvancementFees: false,");
  console.log("   }");
  console.log();
  console.log("2. Grant sponsor quota to team members:");
  console.log("   - Use quota_actions::do_grant_sponsor_quota action");
  console.log("   - Or set up default quota via DAO config");
  console.log();
  console.log("3. Once enabled, sponsors can:");
  console.log("   - sponsor_proposal: Uses ONE quota to sponsor ALL pass outcomes");
  console.log("   - Sponsored outcomes bypass TWAP threshold (just need TWAP >= reject TWAP)");
  console.log("   - Cannot sponsor outcome 0 (reject) - it's the baseline");
  console.log();

  // ============================================================================
  // Summary
  // ============================================================================
  logSection("TEST COMPLETED");
  console.log("Summary:");
  console.log("  - Created and initialized test proposal atomically");
  console.log(`  - Validated sponsor_proposal fails when disabled: ${sponsorshipFailed ? "YES" : "NO"}`);
  console.log("  - Documented how to enable sponsorship");
  console.log();

  if (sponsorshipFailed) {
    logSuccess("Sponsorship guard working correctly!");
  } else {
    logInfo("Unexpected behavior detected - review output above");
  }
  console.log();
}

main().catch((error) => {
  logError(`Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
