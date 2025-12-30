/**
 * Direct DAO Creation Script (Full Actions - matches launchpad)
 *
 * Creates a DAO directly using the factory's `create_dao` function,
 * bypassing the launchpad raise flow. Includes ALL the same init actions
 * that launchpad uses:
 *
 * 1. create_stream (stable coin vesting from treasury)
 * 2. mint (asset tokens for team allocation)
 * 3. transfer_coin (transfer minted tokens to team)
 * 4. mint (asset tokens for vesting)
 * 5. deposit (deposit minted tokens to treasury)
 * 6. create_stream (asset coin vesting from treasury)
 * 7. create_pool_with_mint (AMM pool)
 * 8. update_trading_params
 * 9. update_twap_config
 *
 * The script:
 * 1. Loads test coins from protocol-setup
 * 2. Builds init action specs using the builder pattern (9 actions)
 * 3. Calls factory::create_dao with init_specs
 * 4. Deposits stable tokens to treasury (needed for pool + stream)
 * 5. Executes all 9 staged init actions
 * 6. Saves DAO info for other tests
 *
 * PREREQUISITES:
 *   npx tsx scripts/protocol-setup.ts   # Run ONCE to set up test coins
 *
 * USAGE:
 *   npx tsx scripts/create-dao-direct.ts
 */

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { TransactionUtils } from "../src/services/transaction";
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface TestCoinInfo {
  packageId: string;
  type: string;
  treasuryCap: string;
  metadata: string;
  isSharedTreasuryCap: boolean;
}

interface TestCoinsInfo {
  asset: TestCoinInfo;
  stable: TestCoinInfo;
  lp: TestCoinInfo;
  timestamp: number;
  network: string;
}

// ============================================================================
// Load Test Coins
// ============================================================================

function loadTestCoins(): TestCoinsInfo {
  const testCoinsPath = path.join(__dirname, "..", "test-coins-info.json");

  if (!fs.existsSync(testCoinsPath)) {
    throw new Error(
      `Test coins not found at ${testCoinsPath}.\n` +
      `Please run protocol setup first:\n` +
      `  npx tsx scripts/protocol-setup.ts`
    );
  }

  return JSON.parse(fs.readFileSync(testCoinsPath, "utf-8"));
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("DIRECT DAO CREATION (Full Actions - matches launchpad)");
  console.log("=".repeat(80));

  // Initialize SDK
  const sdk = await initSDK();
  const sender = getActiveAddress();
  console.log(`\nActive Address: ${sender}`);

  // Load test coins from protocol setup
  console.log("\nLoading test coins from protocol-setup...");
  const testCoins = loadTestCoins();
  console.log(`   Asset: ${testCoins.asset.type}`);
  console.log(`   Stable: ${testCoins.stable.type}`);
  console.log(`   LP: ${testCoins.lp.type}`);
  console.log("Test coins loaded!");

  // Get package IDs from SDK
  const accountActionsPackageId = sdk.packages.accountActions;
  const futarchyFactoryPackageId = sdk.packages.futarchyFactory;
  const futarchyActionsPackageId = sdk.packages.futarchyActions;
  const futarchyCorePackageId = sdk.packages.futarchyCore;

  // Get shared objects
  const factoryObj = sdk.sharedObjects.factory;
  const registryObj = sdk.sharedObjects.packageRegistry;
  const feeManagerObj = sdk.sharedObjects.feeManager;

  console.log(`\nPackage IDs:`);
  console.log(`   Factory: ${futarchyFactoryPackageId}`);
  console.log(`   Actions: ${accountActionsPackageId}`);

  // ============================================================================
  // Action Parameters (same as launchpad)
  // ============================================================================

  // Stream parameters (stable coin vesting)
  const currentTime = Date.now();
  const streamStart = currentTime + 300_000; // Start in 5 minutes
  const stableStreamAmount = TransactionUtils.suiToMist(0.5); // 0.5 stable
  const stableIterationsTotal = 12n;
  const stableIterationPeriodMs = 2_592_000_000n; // 30 days
  const stableAmountPerIteration = stableStreamAmount / stableIterationsTotal;

  // Team mint & transfer parameters
  const teamMintAmount = TransactionUtils.suiToMist(100); // 100 asset tokens
  const teamRecipient = sender;

  // Asset vesting parameters
  const assetStreamAmount = TransactionUtils.suiToMist(50); // 50 asset tokens
  const assetIterationsTotal = 6n;
  const assetIterationPeriodMs = 1_296_000_000n; // 15 days
  const assetAmountPerIteration = assetStreamAmount / assetIterationsTotal;

  // Pool creation parameters
  const poolAssetAmount = TransactionUtils.suiToMist(1000);
  const poolStableAmount = TransactionUtils.suiToMist(1000);
  const poolFeeBps = 30;

  // Total stable needed: pool (1000) + stream (0.5)
  const totalStableNeeded = poolStableAmount + stableStreamAmount;

  // ============================================================================
  // STEP 1: Build Action Specs and Create DAO
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 1: BUILD ACTION SPECS AND CREATE DAO");
  console.log("=".repeat(80));

  console.log("\nBuilding create_dao transaction with 10 init specs:");
  console.log("   0. deposit_external (stable to treasury)");
  console.log("   1. create_stream (stable vesting)");
  console.log("   2. mint (team tokens)");
  console.log("   3. transfer_coin (to team)");
  console.log("   4. mint (vesting tokens)");
  console.log("   5. deposit (vesting tokens to treasury)");
  console.log("   6. create_stream (asset vesting)");
  console.log("   7. create_pool_with_mint");
  console.log("   8. update_trading_params");
  console.log("   9. update_twap_config");

  // Query the actual DAO creation fee from FeeManager
  const feeManagerData = await sdk.client.getObject({
    id: feeManagerObj.id,
    options: { showContent: true },
  });
  const feeManagerFields = (feeManagerData.data?.content as any)?.fields;
  const daoCreationFee = BigInt(feeManagerFields?.dao_creation_fee || 10000);
  console.log(`\n   DAO Creation Fee: ${daoCreationFee} MIST (${TransactionUtils.mistToSui(daoCreationFee)} SUI)`);

  const createDaoTx = new Transaction();

  // DAO creation fee payment (split from gas) - must be EXACTLY the fee amount
  const [paymentCoin] = createDaoTx.splitCoins(createDaoTx.gas, [createDaoTx.pure.u64(daoCreationFee)]);

  // Create action spec builder
  const builder = createDaoTx.moveCall({
    target: `${accountActionsPackageId}::action_spec_builder::new`,
    arguments: [],
  });

  // === Action 0: Deposit External (stable tokens into treasury) ===
  // This MUST be first so stable is available for pool + stream
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::vault_init_actions::add_deposit_external_spec`,
    typeArguments: [testCoins.stable.type],
    arguments: [
      builder,
      createDaoTx.pure.string("treasury"), // vault_name
      createDaoTx.pure.u64(totalStableNeeded), // expected_amount
    ],
  });

  // === Action 1: Create Stream (stable coin vesting from treasury) ===
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
    typeArguments: [testCoins.stable.type],
    arguments: [
      builder,
      createDaoTx.pure.string("treasury"), // vault_name
      createDaoTx.pure(bcs.Address.serialize(sender).toBytes()), // beneficiary
      createDaoTx.pure.u64(stableAmountPerIteration), // amount_per_iteration
      createDaoTx.pure.u64(streamStart), // start_time
      createDaoTx.pure.u64(stableIterationsTotal), // iterations_total
      createDaoTx.pure.u64(stableIterationPeriodMs), // iteration_period_ms
      createDaoTx.pure.option("u64", null), // cliff_time
      createDaoTx.pure.option("u64", null), // claim_window_ms
      createDaoTx.pure.u64(stableAmountPerIteration), // max_per_withdrawal
    ],
  });

  // === Action 2: Mint (asset tokens for team allocation) ===
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
    typeArguments: [testCoins.asset.type],
    arguments: [
      builder,
      createDaoTx.pure.u64(teamMintAmount), // amount
      createDaoTx.pure.string("team_tokens"), // resource_name
    ],
  });

  // === Action 3: Transfer Coin (minted tokens to team) ===
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_spec`,
    typeArguments: [testCoins.asset.type],
    arguments: [
      builder,
      createDaoTx.pure.address(teamRecipient), // recipient
      createDaoTx.pure.string("team_tokens"), // resource_name
    ],
  });

  // === Action 4: Mint (asset tokens for vesting) ===
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
    typeArguments: [testCoins.asset.type],
    arguments: [
      builder,
      createDaoTx.pure.u64(assetStreamAmount), // amount
      createDaoTx.pure.string("vesting_tokens"), // resource_name
    ],
  });

  // === Action 5: Deposit (minted tokens to treasury) ===
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
    typeArguments: [testCoins.asset.type],
    arguments: [
      builder,
      createDaoTx.pure.string("treasury"), // vault_name
      createDaoTx.pure.u64(assetStreamAmount), // amount
      createDaoTx.pure.string("vesting_tokens"), // resource_name
    ],
  });

  // === Action 6: Create Stream (asset coin vesting from treasury) ===
  createDaoTx.moveCall({
    target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
    typeArguments: [testCoins.asset.type],
    arguments: [
      builder,
      createDaoTx.pure.string("treasury"), // vault_name
      createDaoTx.pure(bcs.Address.serialize(sender).toBytes()), // beneficiary
      createDaoTx.pure.u64(assetAmountPerIteration), // amount_per_iteration
      createDaoTx.pure.u64(streamStart), // start_time
      createDaoTx.pure.u64(assetIterationsTotal), // iterations_total
      createDaoTx.pure.u64(assetIterationPeriodMs), // iteration_period_ms
      createDaoTx.pure.option("u64", null), // cliff_time
      createDaoTx.pure.option("u64", null), // claim_window_ms
      createDaoTx.pure.u64(assetAmountPerIteration), // max_per_withdrawal
    ],
  });

  // === Action 7: Create Pool with Mint ===
  createDaoTx.moveCall({
    target: `${futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
    typeArguments: [
      testCoins.asset.type,
      testCoins.stable.type,
      testCoins.lp.type,
    ],
    arguments: [
      builder,
      createDaoTx.pure.string("treasury"), // vault_name
      createDaoTx.pure.u64(poolAssetAmount), // asset_amount
      createDaoTx.pure.u64(poolStableAmount), // stable_amount
      createDaoTx.pure.u64(poolFeeBps), // fee_bps
      createDaoTx.pure.u64(0), // launch_fee_duration_ms
      createDaoTx.pure.id(testCoins.lp.treasuryCap), // lp_treasury_cap_id
      createDaoTx.pure.id(testCoins.lp.metadata), // lp_metadata_id
    ],
  });

  // === Action 8: Update Trading Params ===
  createDaoTx.moveCall({
    target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
    arguments: [
      builder,
      createDaoTx.pure.option("u64", null), // min_asset_amount
      createDaoTx.pure.option("u64", null), // min_stable_amount
      createDaoTx.pure.option("u64", 1000), // review_period_ms (1 second for testing)
      createDaoTx.pure.option("u64", 60000), // trading_period_ms (1 minute for testing)
      createDaoTx.pure.option("u64", null), // amm_total_fee_bps
    ],
  });

  // === Action 9: Update TWAP Config ===
  createDaoTx.moveCall({
    target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
    arguments: [
      builder,
      createDaoTx.pure.option("u64", 0), // start_delay
      createDaoTx.pure.option("u64", null), // step_max
      createDaoTx.pure.option("u128", null), // initial_observation
      createDaoTx.pure.option("u128", 0n), // threshold (0% = always pass)
    ],
  });

  // 10. add_update_governance_spec - Set max_outcomes to 10 for multi-outcome testing
  createDaoTx.moveCall({
    target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_governance_spec`,
    arguments: [
      builder,
      createDaoTx.pure.option("u64", 10), // max_outcomes (default is 2, set to 10)
      createDaoTx.pure.option("u64", null), // max_actions_per_outcome
      createDaoTx.pure.option("u64", null), // required_bond_amount
      createDaoTx.pure.option("u64", null), // max_intents_per_outcome
      createDaoTx.pure.option("u64", null), // proposal_intent_expiry_ms
      createDaoTx.pure.option("u64", null), // optimistic_challenge_fee
      createDaoTx.pure.option("u64", null), // optimistic_challenge_period_ms
      createDaoTx.pure.option("u64", null), // proposal_creation_fee
      createDaoTx.pure.option("u64", null), // proposal_fee_per_outcome
      createDaoTx.pure.option("bool", null), // fee_in_asset_token
      createDaoTx.pure.option("bool", null), // accept_new_proposals
      createDaoTx.pure.option("bool", null), // enable_premarket_reservation_lock
      createDaoTx.pure.option("bool", null), // show_proposal_details
    ],
  });

  // Convert builder to vector<ActionSpec>
  const initSpecs = createDaoTx.moveCall({
    target: `${accountActionsPackageId}::action_spec_builder::into_vector`,
    arguments: [builder],
  });

  // Call factory::create_dao
  createDaoTx.moveCall({
    target: `${futarchyFactoryPackageId}::factory::create_dao`,
    typeArguments: [testCoins.asset.type, testCoins.stable.type],
    arguments: [
      createDaoTx.sharedObjectRef({
        objectId: factoryObj.id,
        initialSharedVersion: factoryObj.version,
        mutable: true,
      }),
      createDaoTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: false,
      }),
      createDaoTx.sharedObjectRef({
        objectId: feeManagerObj.id,
        initialSharedVersion: feeManagerObj.version,
        mutable: true,
      }),
      paymentCoin,
      createDaoTx.pure.string(""), // affiliate_id
      createDaoTx.object(testCoins.asset.treasuryCap),
      createDaoTx.object(testCoins.asset.metadata),
      initSpecs,
      createDaoTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  console.log("\nExecuting create_dao...");
  const createResult = await executeTransaction(sdk, createDaoTx, {
    network: "devnet",
    dryRun: false,
    showEffects: true,
    showObjectChanges: true,
    showEvents: true,
  });

  // Find the created DAO Account
  const daoCreatedEvent = createResult.events?.find((e: any) =>
    e.type.includes("DAOCreated")
  );

  let accountId: string | undefined;
  if (daoCreatedEvent) {
    accountId = daoCreatedEvent.parsedJson?.account_id;
    console.log(`\nDAO Created!`);
    console.log(`   Account ID: ${accountId}`);
  }

  if (!accountId) {
    const accountObject = createResult.objectChanges?.find((c: any) =>
      c.objectType?.includes("::account::Account")
    );
    if (accountObject) {
      accountId = accountObject.objectId;
    }
  }

  if (!accountId) {
    throw new Error("Could not find DAO Account ID in transaction result");
  }

  console.log(`   Transaction: ${createResult.digest}`);

  // Wait for the Account object to be indexed (localnet can have a lag)
  console.log("\nWaiting for Account object to be indexed...");
  let retries = 0;
  const maxRetries = 30;
  while (retries < maxRetries) {
    try {
      const accountData = await sdk.client.getObject({ id: accountId });
      if (accountData.data) {
        console.log("   Account object is now available!");
        break;
      }
    } catch (e) {
      // Object not yet available
    }
    retries++;
    if (retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      process.stdout.write(`   Retry ${retries}/${maxRetries}...\r`);
    }
  }
  if (retries === maxRetries) {
    throw new Error("Account object not available after waiting. Try running the script again.");
  }

  // ============================================================================
  // STEP 2: Execute All 10 Init Actions (including stable deposit)
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("STEP 2: EXECUTE ALL 10 INIT ACTIONS");
  console.log("=".repeat(80));

  console.log("\nExecuting 10 staged init actions...");
  console.log(`   (includes minting and depositing ${TransactionUtils.mistToSui(totalStableNeeded)} stable tokens)`);

  const executeTx = new Transaction();

  // 1. Begin execution
  const executable = executeTx.moveCall({
    target: `${futarchyFactoryPackageId}::dao_init_executor::begin_execution`,
    arguments: [
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: false,
      }),
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  // Create witnesses
  const versionWitness = executeTx.moveCall({
    target: `${accountActionsPackageId}::actions_version::current`,
    arguments: [],
  });

  const intentWitness = executeTx.moveCall({
    target: `${futarchyFactoryPackageId}::dao_init_executor::dao_init_intent_witness`,
    arguments: [],
  });

  // Type context for init actions
  const configType = `${futarchyCorePackageId}::futarchy_config::FutarchyConfig`;
  const outcomeType = `${futarchyFactoryPackageId}::dao_init_outcome::DaoInitOutcome`;
  const witnessType = `${futarchyFactoryPackageId}::dao_init_executor::DaoInitIntent`;

  // 2. Mint stable coins for deposit_external action
  // For shared treasury cap, we need to get the actual initialSharedVersion
  let stableTreasuryCapArg;
  if (testCoins.stable.isSharedTreasuryCap) {
    const stableTreasuryCapData = await sdk.client.getObject({
      id: testCoins.stable.treasuryCap,
      options: { showOwner: true },
    });
    const sharedOwner = (stableTreasuryCapData.data?.owner as any)?.Shared;
    const initialSharedVersion = sharedOwner?.initial_shared_version || 1;
    console.log(`   Stable TreasuryCap initialSharedVersion: ${initialSharedVersion}`);
    stableTreasuryCapArg = executeTx.sharedObjectRef({
      objectId: testCoins.stable.treasuryCap,
      initialSharedVersion: parseInt(initialSharedVersion),
      mutable: true,
    });
  } else {
    stableTreasuryCapArg = executeTx.object(testCoins.stable.treasuryCap);
  }

  // Use the standard sui::coin::mint which returns a Coin (not the test coin's entry mint which transfers directly)
  const stableCoin = executeTx.moveCall({
    target: `0x2::coin::mint`,
    typeArguments: [testCoins.stable.type],
    arguments: [
      stableTreasuryCapArg,
      executeTx.pure.u64(totalStableNeeded),
    ],
  });

  // 3. Execute each action in order (MUST match staging order!)

  // Action 0: Deposit External (stable to treasury)
  console.log("   0. deposit_external (stable to treasury)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::vault::do_deposit_external`,
    typeArguments: [configType, outcomeType, testCoins.stable.type, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      stableCoin,
      versionWitness,
      intentWitness,
    ],
  });

  // Action 1: Create Stream (stable)
  console.log("   1. create_stream (stable vesting)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::vault::do_init_create_stream`,
    typeArguments: [configType, outcomeType, testCoins.stable.type, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
      versionWitness,
      intentWitness,
    ],
  });

  // Action 2: Mint (team tokens)
  console.log("   2. mint (team tokens)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::currency::do_init_mint`,
    typeArguments: [outcomeType, testCoins.asset.type, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      versionWitness,
      intentWitness,
    ],
  });

  // Action 3: Transfer Coin (to team)
  console.log("   3. transfer_coin (to team)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::transfer::do_init_transfer_coin`,
    typeArguments: [outcomeType, testCoins.asset.type, witnessType],
    arguments: [
      executable,
      intentWitness,
    ],
  });

  // Action 4: Mint (vesting tokens)
  console.log("   4. mint (vesting tokens)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::currency::do_init_mint`,
    typeArguments: [outcomeType, testCoins.asset.type, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      versionWitness,
      intentWitness,
    ],
  });

  // Action 5: Deposit (vesting tokens to treasury)
  console.log("   5. deposit (vesting tokens to treasury)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::vault::do_init_deposit`,
    typeArguments: [configType, outcomeType, testCoins.asset.type, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      versionWitness,
      intentWitness,
    ],
  });

  // Action 6: Create Stream (asset)
  console.log("   6. create_stream (asset vesting)...");
  executeTx.moveCall({
    target: `${accountActionsPackageId}::vault::do_init_create_stream`,
    typeArguments: [configType, outcomeType, testCoins.asset.type, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
      versionWitness,
      intentWitness,
    ],
  });

  // Action 7: Create Pool with Mint
  console.log("   7. create_pool_with_mint...");
  executeTx.moveCall({
    target: `${futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_with_mint`,
    typeArguments: [
      configType,
      outcomeType,
      testCoins.asset.type,
      testCoins.stable.type,
      testCoins.lp.type,
      witnessType,
    ],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      executeTx.object(testCoins.lp.treasuryCap),
      executeTx.object(testCoins.lp.metadata),
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
      versionWitness,
      intentWitness,
    ],
  });

  // Action 8: Update Trading Params
  console.log("   8. update_trading_params...");
  executeTx.moveCall({
    target: `${futarchyActionsPackageId}::config_actions::do_update_trading_params`,
    typeArguments: [outcomeType, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      versionWitness,
      intentWitness,
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  // Action 9: Update TWAP Config
  console.log("   9. update_twap_config...");
  executeTx.moveCall({
    target: `${futarchyActionsPackageId}::config_actions::do_update_twap_config`,
    typeArguments: [outcomeType, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      versionWitness,
      intentWitness,
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  // Action 10: Update Governance (set max_outcomes to 10)
  console.log("   10. update_governance (max_outcomes=10)...");
  executeTx.moveCall({
    target: `${futarchyActionsPackageId}::config_actions::do_update_governance`,
    typeArguments: [outcomeType, witnessType],
    arguments: [
      executable,
      executeTx.object(accountId),
      executeTx.sharedObjectRef({
        objectId: registryObj.id,
        initialSharedVersion: registryObj.version,
        mutable: true,
      }),
      versionWitness,
      intentWitness,
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  // 3. Finalize execution
  executeTx.moveCall({
    target: `${futarchyFactoryPackageId}::dao_init_executor::finalize_execution`,
    arguments: [
      executeTx.object(accountId),
      executable,
      executeTx.sharedObjectRef({
        objectId: "0x6",
        initialSharedVersion: 1,
        mutable: false,
      }),
    ],
  });

  const executeResult = await executeTransaction(sdk, executeTx, {
    network: "devnet",
    dryRun: false,
    showEffects: true,
    showObjectChanges: true,
    showEvents: true,
  });

  console.log("\nAll 10 init actions executed!");
  console.log(`   Transaction: ${executeResult.digest}`);

  // Find the created pool
  let poolId: string | undefined;
  const poolObject = executeResult.objectChanges?.find((c: any) =>
    c.objectType?.includes("::unified_spot_pool::UnifiedSpotPool")
  );
  if (poolObject) {
    poolId = poolObject.objectId;
    console.log(`   Pool ID: ${poolId}`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("DIRECT DAO CREATION COMPLETE!");
  console.log("=".repeat(80));

  console.log("\nSummary:");
  console.log(`   Executed 10 init actions:`);
  console.log(`     0. deposit_external - Stable tokens deposited (${TransactionUtils.mistToSui(totalStableNeeded)})`);
  console.log(`     1. create_stream - Stable vesting (${TransactionUtils.mistToSui(stableStreamAmount)} over ${stableIterationsTotal} iterations)`);
  console.log(`     2. mint - Team tokens (${TransactionUtils.mistToSui(teamMintAmount)} asset)`);
  console.log(`     3. transfer_coin - Sent to ${teamRecipient.slice(0, 10)}...`);
  console.log(`     4. mint - Vesting tokens (${TransactionUtils.mistToSui(assetStreamAmount)} asset)`);
  console.log(`     5. deposit - To treasury`);
  console.log(`     6. create_stream - Asset vesting (${TransactionUtils.mistToSui(assetStreamAmount)} over ${assetIterationsTotal} iterations)`);
  console.log(`     7. create_pool_with_mint - AMM pool created`);
  console.log(`     8. update_trading_params - Review/Trading periods set`);
  console.log(`     9. update_twap_config - TWAP threshold set to 0%`);

  console.log("\nThis DAO is ready for:");
  console.log("   - Creating governance proposals");
  console.log("   - Swapping on the AMM pool");
  console.log("   - Claiming vesting streams");

  console.log(`\nView DAO: https://suiscan.xyz/devnet/object/${accountId}`);
  if (poolId) {
    console.log(`View Pool: https://suiscan.xyz/devnet/object/${poolId}`);
  }

  // Save DAO info for other tests
  const daoInfoPath = path.join(__dirname, "..", "test-dao-info.json");
  const daoInfo = {
    accountId: accountId,
    assetType: testCoins.asset.type,
    stableType: testCoins.stable.type,
    lpType: testCoins.lp.type,
    assetTreasuryCap: testCoins.asset.treasuryCap,
    assetMetadata: testCoins.asset.metadata,
    stableTreasuryCap: testCoins.stable.treasuryCap,
    stableMetadata: testCoins.stable.metadata,
    lpTreasuryCap: testCoins.lp.treasuryCap,
    lpMetadata: testCoins.lp.metadata,
    isStableTreasuryCapShared: testCoins.stable.isSharedTreasuryCap,
    stablePackageId: testCoins.stable.packageId,
    spotPoolId: poolId,
    timestamp: Date.now(),
    network: testCoins.network,
    createdVia: "factory::create_dao (full actions)",
  };

  fs.writeFileSync(daoInfoPath, JSON.stringify(daoInfo, null, 2), "utf-8");
  console.log(`\nDAO info saved to: ${daoInfoPath}`);
}

main()
  .then(() => {
    console.log("\nScript completed successfully\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });
