import { NetworkType } from "../../src";
import { execSync } from "child_process";

// Get the current network from Sui CLI active environment
export const getCurrentNetwork = (): NetworkType => {
    // First check environment variable override
    const envNetwork = process.env.SUI_NETWORK?.toLowerCase();
    if (envNetwork) {
      console.log(`Using network from SUI_NETWORK env: ${envNetwork}`);
      if (envNetwork === "mainnet") return "mainnet";
      if (envNetwork === "testnet") return "testnet";
      if (envNetwork === "localnet") return "localnet";
      return "devnet";
    }

    // Otherwise use Sui CLI active environment
    const activeEnv = execSync('sui client active-env', { encoding: 'utf8' }).trim();
    console.log(`Using network from Sui CLI: ${activeEnv}`);
    return activeEnv as NetworkType;
  };