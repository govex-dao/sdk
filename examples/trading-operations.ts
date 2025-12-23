/**
 * Example: Trading Operations
 *
 * This example demonstrates common trading operations:
 * 1. Adding liquidity to spot pools
 * 2. Swapping tokens on spot AMM
 * 3. Trading on conditional markets
 * 4. Querying pool state and prices
 */

import { Transaction } from "@mysten/sui/transactions";
import { FutarchySDK } from "../src";

// Example configuration
const CONFIG = {
  ASSET_TYPE: "0xYOUR_PACKAGE::coin::ASSET",
  STABLE_TYPE: "0xYOUR_PACKAGE::coin::STABLE",
  LP_TYPE: "0xYOUR_PACKAGE::pool::LP",
  SPOT_POOL_ID: "0xYOUR_SPOT_POOL_ID",
};

async function main() {
  // Initialize SDK
  const sdk = new FutarchySDK({
    network: "devnet",
  });

  console.log("✅ SDK initialized");

  const marketWorkflow = sdk.workflows.market;

  // ===== SPOT AMM OPERATIONS =====

  console.log("\n📊 Spot AMM Operations");

  // --- Add Liquidity ---
  console.log("\n💧 Adding liquidity to spot pool...");

  const addLiquidityTx = marketWorkflow.addLiquidity({
    poolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    assetCoinId: "0xYOUR_ASSET_COIN_ID",
    stableCoinId: "0xYOUR_STABLE_COIN_ID",
    minLpOut: BigInt(0), // Set minimum for slippage protection
  });

  console.log("Add liquidity transaction created");

  // --- Remove Liquidity ---
  console.log("\n💨 Removing liquidity from spot pool...");

  const removeLiquidityTx = marketWorkflow.removeLiquidity({
    poolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    lpCoinId: "0xYOUR_LP_TOKEN_ID",
    minAssetOut: BigInt(0),
    minStableOut: BigInt(0),
  });

  console.log("Remove liquidity transaction created");

  // --- Spot Swap (Asset -> Stable) ---
  console.log("\n🔄 Swapping asset for stable on spot AMM...");

  const sellAssetTx = marketWorkflow.spotSwap({
    poolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    direction: "sell_asset",
    assetCoinId: "0xYOUR_ASSET_COIN_ID",
    minStableOut: BigInt(0), // Slippage protection
  });

  console.log("Sell asset swap transaction created");

  // --- Spot Swap (Stable -> Asset) ---
  console.log("\n🔄 Swapping stable for asset on spot AMM...");

  const buyAssetTx = marketWorkflow.spotSwap({
    poolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    direction: "buy_asset",
    stableCoinId: "0xYOUR_STABLE_COIN_ID",
    minAssetOut: BigInt(0), // Slippage protection
  });

  console.log("Buy asset swap transaction created");

  // ===== CONDITIONAL MARKET OPERATIONS =====

  console.log("\n📈 Conditional Market Operations");

  const CONDITIONAL_CONFIG = {
    PROPOSAL_ID: "0xPROPOSAL_ID",
    ESCROW_ID: "0xESCROW_ID",
    OUTCOME_INDEX: 1, // Accept outcome
    COND_ASSET_TYPE: "0x...::cond1_asset::COND1_ASSET",
    COND_STABLE_TYPE: "0x...::cond1_stable::COND1_STABLE",
  };

  // --- Buy Conditional Tokens ---
  console.log("\n🎯 Buying conditional asset tokens...");

  const buyCondTx = sdk.workflows.proposal.conditionalSwap({
    proposalId: CONDITIONAL_CONFIG.PROPOSAL_ID,
    escrowId: CONDITIONAL_CONFIG.ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    outcomeIndex: CONDITIONAL_CONFIG.OUTCOME_INDEX,
    assetConditionalType: CONDITIONAL_CONFIG.COND_ASSET_TYPE,
    stableConditionalType: CONDITIONAL_CONFIG.COND_STABLE_TYPE,
    direction: "buy_asset",
    stableAmount: BigInt(100_000_000), // Amount of stable to spend
  });

  console.log("Buy conditional tokens transaction created");

  // --- Sell Conditional Tokens ---
  console.log("\n🎯 Selling conditional asset tokens...");

  const sellCondTx = sdk.workflows.proposal.conditionalSwap({
    proposalId: CONDITIONAL_CONFIG.PROPOSAL_ID,
    escrowId: CONDITIONAL_CONFIG.ESCROW_ID,
    spotPoolId: CONFIG.SPOT_POOL_ID,
    assetType: CONFIG.ASSET_TYPE,
    stableType: CONFIG.STABLE_TYPE,
    lpType: CONFIG.LP_TYPE,
    outcomeIndex: CONDITIONAL_CONFIG.OUTCOME_INDEX,
    assetConditionalType: CONDITIONAL_CONFIG.COND_ASSET_TYPE,
    stableConditionalType: CONDITIONAL_CONFIG.COND_STABLE_TYPE,
    direction: "sell_asset",
    assetAmount: BigInt(50_000_000), // Amount of conditional tokens to sell
  });

  console.log("Sell conditional tokens transaction created");

  // ===== QUERY POOL STATE =====

  console.log("\n🔍 Querying pool state...");

  // Get pool object
  const poolData = await sdk.query.getObject(CONFIG.SPOT_POOL_ID);

  if (poolData.data?.content?.dataType === "moveObject") {
    const fields = poolData.data.content.fields as any;
    console.log("\nPool State:");
    console.log("  ID:", fields.id?.id);

    // Access pool reserves if available
    if (fields.asset_reserve) {
      console.log("  Asset Reserve:", fields.asset_reserve);
    }
    if (fields.stable_reserve) {
      console.log("  Stable Reserve:", fields.stable_reserve);
    }
    if (fields.lp_supply) {
      console.log("  LP Supply:", fields.lp_supply);
    }
    if (fields.fee_bps) {
      console.log("  Fee BPS:", fields.fee_bps);
    }
  }

  // ===== PRICE CALCULATION =====

  console.log("\n💰 Price Calculations");

  // Calculate spot price from reserves
  function calculateSpotPrice(
    assetReserve: bigint,
    stableReserve: bigint
  ): number {
    return Number(stableReserve) / Number(assetReserve);
  }

  // Calculate output amount for swap (constant product AMM)
  function calculateSwapOutput(
    inputAmount: bigint,
    inputReserve: bigint,
    outputReserve: bigint,
    feeBps: number = 30
  ): bigint {
    const feeMultiplier = BigInt(10000 - feeBps);
    const inputWithFee = inputAmount * feeMultiplier;
    const numerator = inputWithFee * outputReserve;
    const denominator = inputReserve * BigInt(10000) + inputWithFee;
    return numerator / denominator;
  }

  // Example calculation
  const assetReserve = BigInt(1000_000_000_000); // 1000 tokens
  const stableReserve = BigInt(2000_000_000_000); // 2000 stable

  console.log("\nExample Pool:");
  console.log("  Asset Reserve:", Number(assetReserve) / 1e9);
  console.log("  Stable Reserve:", Number(stableReserve) / 1e9);
  console.log("  Spot Price:", calculateSpotPrice(assetReserve, stableReserve));

  const swapInput = BigInt(100_000_000_000); // 100 tokens
  const swapOutput = calculateSwapOutput(swapInput, assetReserve, stableReserve);
  console.log(`\nSelling ${Number(swapInput) / 1e9} asset tokens:`);
  console.log(`  Expected output: ${Number(swapOutput) / 1e9} stable`);
  console.log(
    `  Effective price: ${Number(swapOutput) / Number(swapInput)}`
  );

  // ===== USER BALANCES =====

  console.log("\n👛 Checking user token balances...");

  const userAddress = "0xYOUR_ADDRESS";

  try {
    // Get all coin balances
    const balances = await sdk.query.getAllBalances(userAddress);

    console.log("\nUser Balances:");
    for (const balance of balances) {
      const coinName = balance.coinType.split("::").pop();
      console.log(`  ${coinName}: ${balance.totalBalance}`);
    }
  } catch (error) {
    console.log("(Replace userAddress with actual address to query balances)");
  }

  console.log("\n✅ Trading operations example complete!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
