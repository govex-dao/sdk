import { NetworkType } from "../network";

/**
 * Stable coin configuration for minting
 */
export interface StableCoinConfig {
    /** Package ID of the coin module */
    packageId: string;
    /** TreasuryCap object ID */
    treasuryCapId: string;
    /** Full coin type string */
    coinType: string;
    /** Whether the TreasuryCap is shared (anyone can mint) */
    isShared: boolean;
}

/**
 * Network-specific stable coin configurations
 */
const stableCoinConfigs: Record<NetworkType, StableCoinConfig | undefined> = {
    devnet: {
        packageId: "0xb1ca1199c07697e3d39f1b3ba8f94f52bcd750215ec161428a12eef15b2fbe58",
        treasuryCapId: "0xe784f537cca50e36225a7eed9ab8aacce70a0b2c9ceecdd2e10af981fcde3aac",
        coinType: "0xb1ca1199c07697e3d39f1b3ba8f94f52bcd750215ec161428a12eef15b2fbe58::coin::COIN",
        isShared: true,
    },
    testnet: undefined, // TODO: Add testnet stable coin
    mainnet: undefined, // TODO: Add mainnet stable coin (e.g., USDC)
    localnet: undefined,
};

/**
 * Get stable coin configuration for a network
 * @param network - The network type
 * @returns StableCoinConfig or undefined if not configured
 */
export function getStableCoin(network: NetworkType): StableCoinConfig | undefined {
    return stableCoinConfigs[network];
}

/**
 * Check if stable coin minting is available for a network
 */
export function hasStableCoin(network: NetworkType): boolean {
    const config = stableCoinConfigs[network];
    return config !== undefined && config.isShared;
}
