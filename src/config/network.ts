import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";

export type NetworkType = "mainnet" | "testnet" | "devnet" | "localnet";

export interface NetworkConfig {
    network: NetworkType | string;
    url: string;
    client: SuiClient;
}

/**
 * Creates a SuiClient for the specified network
 *
 * @param network - Network type (mainnet/testnet/devnet/localnet) or custom RPC URL
 * @param rpcUrl - Optional explicit RPC URL (overrides network-based URL)
 * @returns NetworkConfig with client, network type, and URL
 *
 * @example
 * // Using network name with default public fullnode
 * createNetworkConfig("mainnet")
 *
 * @example
 * // Using explicit RPC URL (recommended for production)
 * createNetworkConfig("mainnet", "https://your-endpoint.sui-mainnet.quiknode.pro")
 *
 * @example
 * // Passing URL directly as network (legacy behavior)
 * createNetworkConfig("https://custom-rpc.example.com")
 */
export function createNetworkConfig(
    network: NetworkType | string,
    rpcUrl?: string
): NetworkConfig {
    const isStandardNetwork =
        network === "mainnet" ||
        network === "testnet" ||
        network === "devnet" ||
        network === "localnet";

    // Priority: explicit rpcUrl > network URL > public fullnode
    let url: string;
    if (rpcUrl) {
        url = rpcUrl;
    } else if (isStandardNetwork) {
        url = getFullnodeUrl(network as NetworkType);
    } else {
        // Assume network param is a custom URL (legacy behavior)
        url = network;
    }

    const client = new SuiClient({ url });

    return {
        network: isStandardNetwork ? network : "custom",
        url,
        client,
    };
}
