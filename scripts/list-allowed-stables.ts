/**
 * List all allowed stable types in the Factory
 */

import { initSDK } from "./execute-tx";
import { getCurrentNetwork } from "./lib/network";

async function main() {
  const currentNetwork = getCurrentNetwork();
  console.log(`\nQuerying Factory on ${currentNetwork}...\n`);

  const sdk = await initSDK(currentNetwork);

  try {
    const allowedStables = await sdk.admin.factory.getAllowedStableTypes();

    if (allowedStables.length === 0) {
      console.log("No stable types are currently allowed in the Factory.");
    } else {
      console.log("Allowed stable types:\n");
      allowedStables.forEach((stable, index) => {
        console.log(`  ${index + 1}. ${stable.type}`);
        console.log(`     Package: ${stable.packageId}`);
        if (stable.treasuryCapId) {
          const status = stable.isSharedTreasuryCap ? "SHARED" : "Private";
          console.log(`     TreasuryCap: ${status} (${stable.treasuryCapId})`);
        } else {
          console.log(`     TreasuryCap: Not found`);
        }
        console.log();
      });
    }
  } catch (error: any) {
    console.error("Error querying Factory:", error.message);
  }
}

main();
