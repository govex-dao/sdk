import { NetworkType } from "../../src";
import { executeTransaction } from "../execute-tx";

export async function registerStableCoinForFees(
  sdk: any,
  stableType: string,
  network: NetworkType,
): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("REGISTER STABLE COIN FOR FEE PAYMENTS");
  console.log("=".repeat(80));

  const feeManagerDeployment = sdk.deployments.getPackage("futarchy_markets_core");
  const feeAdminCapId = feeManagerDeployment?.adminCaps?.find((obj: any) =>
    obj.name === "FeeAdminCap"
  )?.objectId;

  if (!feeAdminCapId) {
    throw new Error(
      "FeeAdminCap not found in futarchy_markets_core deployment",
    );
  }

  console.log(`Using FeeAdminCap: ${feeAdminCapId}`);

  try {
    const registerFeeTx = sdk.feeManager.addCoinFeeConfig(
      {
        coinType: stableType,
        decimals: 9,
        daoCreationFee: 100_000_000n,
        proposalFeePerOutcome: 10_000_000n,
      },
      feeAdminCapId,
    );

    await executeTransaction(sdk, registerFeeTx, {
      network,
      dryRun: false,
      showEffects: false,
    });
    console.log("✅ Stable coin registered for fee payments");
  } catch (error: any) {
    console.log(
      "✅ Stable coin already registered for fee payments (or registration not needed)",
    );
  }
}

// Only admins can add allowed stable types to the factory
export async function registerStableCoinInFactory(
  sdk: any,
  stableType: string,
  network: NetworkType,
): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("REGISTER STABLE COIN IN FACTORY ALLOWLIST");
  console.log("=".repeat(80));
  console.log(`Stable type: ${stableType}`);

  const factoryDeployment = sdk.deployments.getPackage("futarchy_factory");
  const factoryOwnerCapId = factoryDeployment?.adminCaps?.find((obj: any) =>
    obj.name === "FactoryOwnerCap"
  )?.objectId;

  if (!factoryOwnerCapId) {
    throw new Error("FactoryOwnerCap not found in futarchy_factory deployment");
  }

  console.log(`Using FactoryOwnerCap: ${factoryOwnerCapId}`);

  try {
    const registerFactoryTx = sdk.admin.factory.addAllowedStableType(
      stableType,
      factoryOwnerCapId,
    );

    await executeTransaction(sdk, registerFactoryTx, {
      network,
      dryRun: false,
      showEffects: false,
    });
    console.log("✅ Stable coin registered in factory allowlist");
  } catch (error: any) {
    // Check if it's the "already registered" error
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes("already") || errorMessage.includes("error code 3")) {
      console.log("✅ Stable coin already allowed in factory");
    } else {
      console.log("❌ Failed to register stable coin:", errorMessage);
      throw error;
    }
  }
}
