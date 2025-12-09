export interface TierSpec {
    /** Price threshold for this tier (u128) */
    priceThreshold: bigint;
    /** True if trigger when price >= threshold, false if price <= threshold */
    isAbove: boolean;
    /** Recipients and their mint amounts */
    recipients: RecipientMint[];
    /** Description of this tier */
    tierDescription: string;
  }
  
  export interface RecipientMint {
    /** Address to receive tokens */
    recipient: string;
    /** Amount to mint for this recipient */
    amount: bigint | number;
  }
  
  export interface CreateGrantConfig {
    /** DAO account ID */
    accountId: string;
    /** Asset token type */
    assetType: string;
    /** Stable token type */
    stableType: string;
    /** Tiers with price conditions and recipients */
    tiers: TierSpec[];
    /** Use relative pricing (based on launchpad price) */
    useRelativePricing: boolean;
    /** Launchpad price multiplier (if useRelativePricing=true) */
    launchpadMultiplier?: number;
    /** Earliest time grant can be claimed (ms offset from now) */
    earliestExecutionOffsetMs: number;
    /** Grant expires after this many years */
    expiryYears: number;
    /** Can grant be cancelled */
    cancelable: boolean;
    /** Grant description */
    description: string;
    /** DAO ID for tracking */
    daoId: string;
    /** Clock object (defaults to 0x6) */
    clock?: string;
  }
  
  export interface ClaimGrantConfig {
    /** DAO account ID */
    accountId: string;
    /** Asset token type */
    assetType: string;
    /** Stable token type */
    stableType: string;
    /** Grant object ID */
    grantId: string;
    /** Tier index to claim */
    tierIndex: number;
    /** ClaimCap object ID */
    claimCapId: string;
    /** Spot pool ID for price checking */
    spotPoolId: string;
    /** Conditional pool IDs (for all outcomes) */
    conditionalPoolIds: string[];
    /** Clock object (defaults to 0x6) */
    clock?: string;
  }
  