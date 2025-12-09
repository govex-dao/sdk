/**
 * Error Mapping
 *
 * Maps Move error codes to human-readable messages.
 * Makes debugging much easier for SDK users.
 *
 * @module core/errors/error-mapping
 */

export const MOVE_ERROR_CODES: Record<string, Record<number, string>> = {
  // =========================================================================
  // ACCOUNT PROTOCOL ERRORS
  // =========================================================================
  'account_protocol::account': {
    0: 'EWrongAccount - account mismatch',
    1: 'EWrongIntent - intent key mismatch',
    2: 'ENotApproved - intent not approved for execution',
    3: 'EHasExpired - intent has expired',
    4: 'ENotExpired - intent has not expired yet',
    5: 'ENotExecutable - intent cannot be executed yet',
    6: 'EActionsRemaining - not all staged actions were executed. Check that you are calling all do_* functions for each staged action.',
    7: 'EVersionMismatch - version mismatch',
  },

  // Short alias for common usage
  'account': {
    0: 'EWrongAccount - account mismatch',
    1: 'EWrongIntent - intent key mismatch',
    2: 'ENotApproved - intent not approved for execution',
    3: 'EHasExpired - intent has expired',
    4: 'ENotExpired - intent has not expired yet',
    5: 'ENotExecutable - intent cannot be executed yet',
    6: 'EActionsRemaining - not all staged actions were executed. Check that you are calling all do_* functions for each staged action.',
    7: 'EVersionMismatch - version mismatch',
  },

  'account_protocol::intents': {
    0: 'Intent not found',
    1: 'Intent already exists',
    2: 'Intent is expired',
    3: 'Intent is locked',
    4: 'Invalid intent state',
    5: 'Action index out of bounds',
    6: 'All actions not executed',
  },

  'account_protocol::executable': {
    0: 'Executable not found',
    1: 'Invalid action index',
    2: 'Action type mismatch',
    3: 'Not all actions executed',
  },

  'account_protocol::deps': {
    2: 'ENotDep - Package not registered in PackageRegistry whitelist. Run: npm run register-packages',
    7: 'ERegistryMismatch - Registry ID does not match expected registry',
  },

  // =========================================================================
  // ACCOUNT ACTIONS ERRORS
  // =========================================================================
  'account_actions::vault': {
    0: 'EVaultNotFound - Vault not found',
    1: 'EInsufficientBalance - Insufficient balance in vault',
    2: 'EVaultAlreadyExists - Vault already exists',
    3: 'ECoinTypeNotApproved - Coin type not approved for vault',
    4: 'EZeroDeposit - Cannot deposit zero amount',
    5: 'EZeroWithdrawal - Cannot withdraw zero amount',
    6: 'EVaultLocked - Vault is locked',
  },

  'account_actions::currency': {
    0: 'ETreasuryCapNotFound - TreasuryCap not found',
    1: 'ECoinMetadataNotFound - CoinMetadata not found',
    2: 'EMintingDisabled - Minting is disabled',
    3: 'EBurningDisabled - Burning is disabled',
    4: 'ESymbolUpdateDisabled - Symbol update is disabled',
    5: 'ENameUpdateDisabled - Name update is disabled',
    6: 'EDescriptionUpdateDisabled - Description update is disabled',
    7: 'EIconUpdateDisabled - Icon update is disabled',
    8: 'EZeroMint - Cannot mint zero amount',
    9: 'EZeroBurn - Cannot burn zero amount',
  },

  'account_actions::stream': {
    0: 'EStreamNotFound - Stream not found',
    1: 'EStreamNotActive - Stream is not active',
    2: 'EStreamNotCancellable - Stream is not cancellable',
    3: 'ENotBeneficiary - Not the stream beneficiary',
    4: 'ENoTokensAvailable - No tokens available to claim',
    5: 'EClaimWindowPassed - Claim window has passed',
    6: 'ECliffNotReached - Cliff time not reached',
    7: 'EStreamAlreadyCancelled - Stream already cancelled',
    8: 'EInvalidStreamParameters - Invalid stream parameters',
  },

  'account_actions::transfer': {
    0: 'EObjectNotFound - Object not found',
    1: 'ENotAuthorized - Not authorized to transfer',
    2: 'EInvalidRecipient - Invalid recipient',
  },

  'account_actions::package_upgrade': {
    0: 'EUpgradeCapNotFound - UpgradeCap not found',
    1: 'EPackageNotFound - Package not found',
    2: 'EInvalidUpgradeDigest - Invalid upgrade digest',
    3: 'EUpgradePolicyViolation - Upgrade policy violation',
    4: 'EUpgradeTicketNotFound - Upgrade ticket not found',
    5: 'ECommitCapNotFound - CommitCap not found',
    6: 'EReclaimDelayNotElapsed - Reclaim delay not elapsed',
  },

  'account_actions::memo': {
    0: 'EMemoTooLong - Memo too long',
  },

  'account_actions::access_control': {
    0: 'EObjectNotFoundInStorage - Object not found in storage',
    1: 'EObjectAlreadyBorrowed - Object is already borrowed',
    2: 'EObjectNotBorrowed - Cannot return object that was not borrowed',
  },

  // =========================================================================
  // FUTARCHY CORE ERRORS
  // =========================================================================
  'futarchy_core::futarchy_config': {
    0: 'EDAOTerminated - DAO is terminated',
    1: 'EProposalsDisabled - Proposals are disabled',
    2: 'EInvalidConfiguration - Invalid configuration',
    3: 'EDAONotFound - DAO not found',
    101: 'ELaunchpadPriceAlreadySet - Launchpad price has already been set',
    102: 'EThresholdExceedsProtocolMax - Threshold exceeds protocol maximum',
    103: 'EDAOTerminated - DAO is terminated',
  },

  'futarchy_core::dao_config': {
    0: 'EInvalidMinAmount - Invalid minimum amount',
    1: 'EInvalidPeriod - Invalid period',
    2: 'EInvalidFee - Invalid fee',
    3: 'EInvalidMaxOutcomes - Invalid max outcomes',
    4: 'EInvalidTwapThreshold - Invalid TWAP threshold',
    5: 'EInvalidProposalFee - Invalid proposal fee',
    6: 'EInvalidBondAmount - Invalid bond amount',
    7: 'EInvalidTwapParams - Invalid TWAP parameters',
    8: 'EInvalidGracePeriod - Invalid grace period',
    9: 'EInvalidMaxConcurrentProposals - Invalid max concurrent proposals',
    10: 'EMaxOutcomesExceedsProtocol - Max outcomes exceeds protocol limit',
    11: 'EMaxActionsExceedsProtocol - Max actions exceeds protocol limit',
    12: 'EStateInconsistent - State is inconsistent',
    14: 'EInvalidQuotaParams - Invalid quota parameters',
    15: 'ENoConditionalMetadata - No conditional metadata',
    16: 'EMinAmountTooLow - Minimum amount too low',
    17: 'ESponsoredThresholdMustBeNonPositive - Sponsored threshold must be non-positive',
    18: 'ESponsoredThresholdExceedsProtocolMax - Sponsored threshold exceeds protocol max',
    19: 'EProposalFeeExceedsMax - Proposal fee exceeds maximum',
  },

  'futarchy_core::action_validation': {
    1: 'EActionTypeMismatch - The action type in the staged spec does not match what the do_* function expects',
  },

  'futarchy_core::resource_requests': {
    1: 'ERequestNotFulfilled - Resource request not fulfilled',
    2: 'EInvalidRequestID - Invalid request ID',
    3: 'EResourceTypeMismatch - Resource type mismatch',
    4: 'EAlreadyFulfilled - Request already fulfilled',
    5: 'EInvalidContext - Invalid context',
  },

  'futarchy_core::proposal_quota_registry': {
    0: 'EInvalidQuotaParams - Invalid quota parameters',
  },

  'futarchy_core::sponsorship_auth': {
    0: 'EUnauthorizedWitness - Unauthorized witness',
  },

  // =========================================================================
  // FUTARCHY ACTIONS ERRORS
  // =========================================================================
  'futarchy_actions::config_actions': {
    0: 'EDAOAlreadyTerminated - DAO is already terminated',
    1: 'EEmptyName - Name cannot be empty',
    2: 'EInvalidParameter - Invalid parameter update',
    3: 'EEmptyString - String cannot be empty',
    4: 'EMismatchedKeyValueLength - Mismatched key/value length',
    5: 'EInvalidConfigType - Invalid config type',
    7: 'EWrongAction - Wrong action',
    8: 'EUnsupportedActionVersion - Action version not supported',
    9: 'ENotActive - Not active',
    10: 'EInvalidRatio - Invalid ratio',
  },

  'futarchy_actions::quota_actions': {
    0: 'EUnsupportedActionVersion - Unsupported action version',
    1: 'EInvalidQuotaParameters - Invalid quota parameters',
    2: 'EQuotaPeriodTooShort - Quota period too short',
  },

  'futarchy_actions::liquidity_init_actions': {
    1: 'EInvalidAmount - Invalid amount - must be positive',
    2: 'EInvalidRatio - Invalid ratio - fee too high',
    3: 'EUnsupportedActionVersion - Unsupported action version',
  },

  'futarchy_actions::liquidity_actions': {
    0: 'EPoolNotFound - Pool not found',
    1: 'EInvalidAmount - Invalid amount',
    2: 'ESlippageExceeded - Slippage exceeded',
    3: 'EInvalidPoolState - Invalid pool state',
    4: 'EPoolMismatch - Pool mismatch',
    5: 'EInsufficientVaultBalance - Insufficient vault balance',
    6: 'EZeroAmount - Zero amount not allowed',
    7: 'EMinimumOutputNotMet - Minimum output not met',
    8: 'EUnsupportedActionVersion - Unsupported action version',
    9: 'EFeeTooHigh - Fee too high (max 10000 bps)',
    10: 'EInsufficientLPTokens - Insufficient LP tokens',
    11: 'ENoFeesToCollect - No fees to collect',
    12: 'EInsufficientFeeBalance - Insufficient fee balance',
  },

  'futarchy_actions::dissolution_actions': {
    0: 'ENotTerminated - DAO is not terminated',
    1: 'EWrongAccount - Wrong account',
    2: 'ETooEarly - Dissolution unlock time not reached',
    3: 'ECapabilityAlreadyExists - Dissolution capability already exists',
    4: 'EInvalidUnlockDelay - Invalid unlock delay',
    5: 'EZeroSupply - Zero supply',
    6: 'EWrongAssetType - Wrong asset type',
  },

  // =========================================================================
  // FUTARCHY GOVERNANCE ERRORS
  // =========================================================================
  'futarchy_governance::proposal_escrow': {
    1: 'EInvalidReceipt - Invalid receipt',
    2: 'ENotEmpty - Not empty',
    3: 'EInsufficientBalance - Insufficient balance',
    4: 'EObjectNotFound - Object not found',
    5: 'EInvalidProposal - Invalid proposal',
    6: 'EAlreadyWithdrawn - Already withdrawn',
    7: 'EProposalNotReady - Proposal not ready',
    8: 'EOutcomeCountMismatch - Outcome count mismatch',
    9: 'EMarketNotInitialized - Market not initialized',
    10: 'EInvalidOutcome - Invalid outcome',
  },

  'futarchy_governance::ptb_executor': {
    0: 'EMarketNotFinalized - Market not finalized',
    1: 'EProposalNotApproved - Winning outcome is 0 (Reject). Actions can only be executed when outcome > 0 (Accept). Make conditional swaps to influence the TWAP in favor of Accept.',
  },

  'futarchy_governance::proposal_lifecycle': {
    1: 'EProposalNotActive - Proposal not active',
    2: 'EMarketNotFinalized - Market not finalized',
    3: 'EProposalNotApproved - Proposal not approved',
    4: 'ENoIntentKey - No intent key',
    5: 'EInvalidWinningOutcome - Invalid winning outcome',
    6: 'EIntentExpiryTooLong - Intent expiry too long',
    7: 'EProposalCreationBlocked - Proposal creation blocked',
  },

  'futarchy_governance::proposal_sponsorship': {
    1: 'ESponsorshipNotEnabled - Sponsorship not enabled',
    2: 'EAlreadySponsored - Already sponsored',
    3: 'ENoSponsorQuota - No sponsor quota',
    4: 'EInvalidProposalState - Invalid proposal state',
    6: 'EDaoMismatch - DAO mismatch',
    7: 'ETwapDelayPassed - TWAP delay passed',
  },

  // =========================================================================
  // FUTARCHY GOVERNANCE ACTIONS ERRORS
  // =========================================================================
  'futarchy_governance_actions::package_registry_actions': {
    0: 'EPackageAlreadyExists - Package already exists',
    1: 'EUnsupportedActionVersion - Unsupported action version',
    2: 'EUnauthorized - Unauthorized',
    3: 'EAccountCreationPaused - Account creation is paused',
    4: 'EAccountCreationNotPaused - Account creation is not paused',
  },

  'futarchy_governance_actions::protocol_admin_actions': {
    0: 'EFactoryAlreadyPaused - Factory is already paused',
    1: 'EInvalidAdminCap - Invalid admin cap',
    2: 'ECapNotFound - Cap not found',
    3: 'EInvalidFeeAmount - Invalid fee amount',
    4: 'EUnsupportedActionVersion - Unsupported action version',
    5: 'EVerificationLevelAlreadyExists - Verification level already exists',
    6: 'EVerificationLevelNotFound - Verification level not found',
    7: 'EInsufficientFeesToWithdraw - Insufficient fees to withdraw',
    8: 'ECoinFeeConfigAlreadyExists - Coin fee config already exists',
    9: 'ECoinFeeConfigNotFound - Coin fee config not found',
    10: 'ENoPendingFeeChanges - No pending fee changes',
  },

  'futarchy_governance_actions::intent_janitor': {
    1: 'ENoExpiredIntents - No expired intents',
    2: 'ECleanupLimitExceeded - Cleanup limit exceeded',
  },

  // =========================================================================
  // FUTARCHY ORACLE ACTIONS ERRORS
  // =========================================================================
  'futarchy_oracle_actions::oracle_actions': {
    0: 'EInvalidAmount - Invalid amount',
    2: 'EPriceConditionNotMet - Price condition not met',
    3: 'EPriceBelowLaunchpad - Price below launchpad',
    4: 'ETierAlreadyExecuted - Tier already executed',
    5: 'ENotRecipient - Not recipient',
    6: 'EAlreadyCanceled - Already canceled',
    8: 'EInsufficientVested - Insufficient vested',
    9: 'ETimeCalculationOverflow - Time calculation overflow',
    10: 'EDaoDissolving - DAO dissolving',
    11: 'EGrantNotCancelable - Grant not cancelable',
    14: 'EExecutionTooEarly - Execution too early',
    15: 'EGrantExpired - Grant expired',
    16: 'EWrongAccount - Wrong account',
    17: 'ERecipientAlreadyClaimed - Recipient already claimed',
    18: 'EEmptyTiers - Empty tiers',
  },

  // Short alias
  'oracle_actions': {
    0: 'EInvalidAmount - Invalid amount',
    2: 'EPriceConditionNotMet - Price condition not met',
    3: 'EPriceBelowLaunchpad - Price below launchpad',
    4: 'ETierAlreadyExecuted - Tier already executed',
    5: 'ENotRecipient - Not recipient',
    6: 'EAlreadyCanceled - Already canceled',
    8: 'EInsufficientVested - Insufficient vested',
    9: 'ETimeCalculationOverflow - Time calculation overflow',
    10: 'EDaoDissolving - DAO dissolving',
    11: 'EGrantNotCancelable - Grant not cancelable',
    14: 'EExecutionTooEarly - Execution too early',
    15: 'EGrantExpired - Grant expired',
    16: 'EWrongAccount - Wrong account',
    17: 'ERecipientAlreadyClaimed - Recipient already claimed',
    18: 'EEmptyTiers - Empty tiers',
  },

  // =========================================================================
  // FUTARCHY MARKETS CORE ERRORS
  // =========================================================================
  'futarchy_markets_core::proposal': {
    0: 'EProposalNotFound - Proposal not found',
    1: 'EInvalidAmount - Invalid amount',
    2: 'EInvalidState - Proposal is not in correct state',
    3: 'ENotAuthorized - Not authorized to modify proposal',
    4: 'EAssetLiquidityTooLow - Asset liquidity too low',
    5: 'EStableLiquidityTooLow - Stable liquidity too low',
    6: 'EPoolNotFound - Pool not found',
    7: 'EOutcomeOutOfBounds - Outcome index out of bounds',
    9: 'ESpotTwapNotReady - Spot TWAP not ready',
    10: 'ETooManyOutcomes - Too many outcomes',
    11: 'EInvalidOutcome - Invalid outcome',
    12: 'ENotFinalized - Proposal not finalized',
    13: 'ETwapNotSet - TWAP not set',
    14: 'ETooManyActions - Too many actions',
    15: 'EInvalidConditionalCoinCount - Invalid conditional coin count',
    16: 'EConditionalCoinAlreadySet - Conditional coin already set',
    17: 'ENotLiquidityProvider - Not liquidity provider',
    18: 'EAlreadySponsored - Already sponsored',
    19: 'ESupplyNotZero - Supply not zero',
    20: 'EInsufficientBalance - Insufficient balance',
    21: 'EPriceVerificationFailed - Price verification failed',
    22: 'ECannotSetActionsForRejectOutcome - Cannot set actions for reject outcome',
    23: 'EInvalidAssetType - Invalid asset type',
    24: 'EInvalidStableType - Invalid stable type',
    25: 'EInsufficientFee - Insufficient fee',
    26: 'ECannotSponsorReject - Cannot sponsor reject',
  },

  // Short alias
  'proposal': {
    0: 'EProposalNotFound - Proposal not found',
    1: 'EInvalidAmount - Invalid amount',
    2: 'EInvalidState - Proposal is not in correct state',
    3: 'ENotAuthorized - Not authorized to modify proposal',
    4: 'EAssetLiquidityTooLow - Asset liquidity too low',
    5: 'EStableLiquidityTooLow - Stable liquidity too low',
    6: 'EPoolNotFound - Pool not found',
    7: 'EOutcomeOutOfBounds - Outcome index out of bounds',
    9: 'ESpotTwapNotReady - Spot TWAP not ready',
    10: 'ETooManyOutcomes - Too many outcomes',
    11: 'EInvalidOutcome - Invalid outcome',
    12: 'ENotFinalized - Proposal not finalized',
    13: 'ETwapNotSet - TWAP not set',
    14: 'ETooManyActions - Too many actions',
    15: 'EInvalidConditionalCoinCount - Invalid conditional coin count',
    16: 'EConditionalCoinAlreadySet - Conditional coin already set',
    17: 'ENotLiquidityProvider - Not liquidity provider',
    18: 'EAlreadySponsored - Already sponsored',
    19: 'ESupplyNotZero - Supply not zero',
    20: 'EInsufficientBalance - Insufficient balance',
    21: 'EPriceVerificationFailed - Price verification failed',
    22: 'ECannotSetActionsForRejectOutcome - Cannot set actions for reject outcome',
    23: 'EInvalidAssetType - Invalid asset type',
    24: 'EInvalidStableType - Invalid stable type',
    25: 'EInsufficientFee - Insufficient fee',
    26: 'ECannotSponsorReject - Cannot sponsor reject',
  },

  'futarchy_markets_core::unified_spot_pool': {
    1: 'EInsufficientLiquidity - Pool has insufficient liquidity for this operation',
    3: 'EInsufficientLPSupply - Insufficient LP token supply',
    4: 'EZeroAmount - Amount cannot be zero',
    5: 'ESlippageExceeded - Slippage tolerance exceeded',
    6: 'EMinimumLiquidityNotMet - Minimum liquidity requirement not met',
    7: 'ENoActiveProposal - No active proposal on pool',
    11: 'EAggregatorNotEnabled - Aggregator is not enabled',
    15: 'EProposalActive - Pool already has an active proposal. Run launchpad-e2e.ts to create a fresh DAO with a clean pool.',
    16: 'EInsufficientGapBetweenProposals - Must wait 6 hours between proposals. The previous proposal ended too recently.',
    20: 'EInvalidLPCoinSymbol - LP coin symbol must be "GOVEX_LP_TOKEN"',
    21: 'EInvalidLPCoinName - LP coin name must be "GOVEX_LP_TOKEN"',
    22: 'ELPSupplyNotZero - LP token supply must be zero when creating pool',
  },

  // Short alias for unified_spot_pool
  'unified_spot_pool': {
    1: 'EInsufficientLiquidity - Pool has insufficient liquidity for this operation',
    3: 'EInsufficientLPSupply - Insufficient LP token supply',
    4: 'EZeroAmount - Amount cannot be zero',
    5: 'ESlippageExceeded - Slippage tolerance exceeded',
    6: 'EMinimumLiquidityNotMet - Minimum liquidity requirement not met',
    7: 'ENoActiveProposal - No active proposal on pool',
    11: 'EAggregatorNotEnabled - Aggregator is not enabled',
    15: 'EProposalActive - Pool already has an active proposal. Run launchpad-e2e.ts to create a fresh DAO with a clean pool.',
    16: 'EInsufficientGapBetweenProposals - Must wait 6 hours between proposals. The previous proposal ended too recently.',
    20: 'EInvalidLPCoinSymbol - LP coin symbol must be "GOVEX_LP_TOKEN"',
    21: 'EInvalidLPCoinName - LP coin name must be "GOVEX_LP_TOKEN"',
    22: 'ELPSupplyNotZero - LP token supply must be zero when creating pool',
  },

  'futarchy_markets_core::arbitrage_core': {
    1: 'EInsufficientProfit - Insufficient profit',
  },

  'futarchy_markets_core::arbitrage_math': {
    0: 'ETooManyConditionals - Too many conditionals',
    1: 'EInvalidFee - Invalid fee',
  },

  'futarchy_markets_core::conditional_coin_utils': {
    0: 'ESupplyNotZero - Supply not zero',
  },

  'futarchy_markets_core::fee': {
    0: 'EInvalidPayment - Invalid payment',
    1: 'EStableTypeNotFound - Stable type not found',
    2: 'EBadWitness - Bad witness',
    3: 'ERecurringFeeNotDue - Recurring fee not due',
    4: 'EWrongStableTypeForFee - Wrong stable type for fee',
    5: 'EInsufficientTreasuryBalance - Insufficient treasury balance',
    6: 'EArithmeticOverflow - Arithmetic overflow',
    7: 'EInvalidAdminCap - Invalid admin cap',
    9: 'EInvalidRecoveryFee - Invalid recovery fee',
    10: 'EFeeExceedsHardCap - Fee exceeds hard cap',
    11: 'EWrongStableCoinType - Wrong stable coin type',
    12: 'EFeeExceedsTenXCap - Fee exceeds 10x cap',
  },

  'futarchy_markets_core::liquidity_initialize': {
    100: 'EInitAssetReservesMismatch - Initial asset reserves mismatch',
    101: 'EInitStableReservesMismatch - Initial stable reserves mismatch',
    102: 'EInitPoolCountMismatch - Initial pool count mismatch',
    103: 'EInitPoolOutcomeMismatch - Initial pool outcome mismatch',
    104: 'EInitZeroLiquidity - Initial zero liquidity',
    105: 'ECapsNotRegistered - Caps not registered',
  },

  'futarchy_markets_core::swap_core': {
    0: 'EInvalidOutcome - Invalid outcome',
    3: 'EInvalidState - Invalid state',
    5: 'EInsufficientOutput - Insufficient output',
    6: 'ESessionMismatch - Session mismatch',
    7: 'EProposalMismatch - Proposal mismatch',
  },

  // =========================================================================
  // FUTARCHY MARKETS OPERATIONS ERRORS
  // =========================================================================
  'futarchy_markets_operations::liquidity_interact': {
    0: 'EInvalidOutcome - Invalid outcome',
    1: 'EInvalidLiquidityTransfer - Invalid liquidity transfer',
    2: 'EWrongOutcome - Wrong outcome',
    3: 'EInvalidState - Invalid state',
    4: 'EMarketIdMismatch - Market ID mismatch',
    5: 'EAssetReservesMismatch - Asset reserves mismatch',
    6: 'EStableReservesMismatch - Stable reserves mismatch',
    7: 'EInsufficientAmount - Insufficient amount',
    8: 'EMinAmountNotMet - Min amount not met',
  },

  'futarchy_markets_operations::no_arb_guard': {
    0: 'ENoArbBandViolation - No-arb band violation',
    1: 'ENoPoolsProvided - No pools provided',
  },

  'futarchy_markets_operations::spot_conditional_quoter': {
    0: 'EInvalidOutcome - Invalid outcome',
    1: 'EZeroAmount - Zero amount',
    2: 'EMarketNotActive - Market not active',
    3: 'EInsufficientLiquidity - Insufficient liquidity',
  },

  'futarchy_markets_operations::swap_entry': {
    0: 'EZeroAmount - Zero amount',
  },

  // =========================================================================
  // FUTARCHY MARKETS PRIMITIVES ERRORS
  // =========================================================================
  'futarchy_markets_primitives::coin_escrow': {
    0: 'EInsufficientBalance - Insufficient balance',
    1: 'EIncorrectSequence - Incorrect sequence',
    2: 'EWrongMarket - Wrong market',
    4: 'ESuppliesNotInitialized - Supplies not initialized',
    5: 'EOutcomeOutOfBounds - Outcome out of bounds',
    8: 'ENotEnoughLiquidity - Not enough liquidity',
    13: 'EZeroAmount - Zero amount',
    101: 'EMarketNotFinalized - Market not finalized',
    102: 'ETradingAlreadyStarted - Trading already started',
    200: 'EAccountingInvariantViolation - Accounting invariant violation',
    201: 'EQuantumInvariantViolation - Quantum invariant violation',
  },

  // Short alias
  'coin_escrow': {
    0: 'EInsufficientBalance - Insufficient balance',
    1: 'EIncorrectSequence - Incorrect sequence',
    2: 'EWrongMarket - Wrong market',
    4: 'ESuppliesNotInitialized - Supplies not initialized',
    5: 'EOutcomeOutOfBounds - Outcome out of bounds',
    8: 'ENotEnoughLiquidity - Not enough liquidity',
    13: 'EZeroAmount - Zero amount',
    101: 'EMarketNotFinalized - Market not finalized',
    102: 'ETradingAlreadyStarted - Trading already started',
    200: 'EAccountingInvariantViolation - Accounting invariant violation',
    201: 'EQuantumInvariantViolation - Quantum invariant violation',
  },

  'futarchy_markets_primitives::conditional_amm': {
    0: 'ELowLiquidity - Low liquidity',
    1: 'EPoolEmpty - Pool empty',
    2: 'EExcessiveSlippage - Excessive slippage',
    3: 'EDivByZero - Division by zero',
    4: 'EZeroLiquidity - Zero liquidity',
    5: 'EPriceTooHigh - Price too high',
    6: 'EZeroAmount - Zero amount',
    7: 'EMarketIdMismatch - Market ID mismatch',
    8: 'EInsufficientLPTokens - Insufficient LP tokens',
    10: 'EOverflow - Overflow',
    11: 'EInvalidFeeRate - Invalid fee rate',
    12: 'EKInvariantViolation - K invariant violation',
    13: 'EImbalancedLiquidity - Imbalanced liquidity',
  },

  // Short alias
  'conditional_amm': {
    0: 'ELowLiquidity - Low liquidity',
    1: 'EPoolEmpty - Pool empty',
    2: 'EExcessiveSlippage - Excessive slippage',
    3: 'EDivByZero - Division by zero',
    4: 'EZeroLiquidity - Zero liquidity',
    5: 'EPriceTooHigh - Price too high',
    6: 'EZeroAmount - Zero amount',
    7: 'EMarketIdMismatch - Market ID mismatch',
    8: 'EInsufficientLPTokens - Insufficient LP tokens',
    10: 'EOverflow - Overflow',
    11: 'EInvalidFeeRate - Invalid fee rate',
    12: 'EKInvariantViolation - K invariant violation',
    13: 'EImbalancedLiquidity - Imbalanced liquidity',
  },

  'futarchy_markets_primitives::conditional_balance': {
    0: 'EInvalidOutcomeIndex - Invalid outcome index',
    1: 'EInvalidBalanceAccess - Invalid balance access',
    2: 'ENotEmpty - Not empty',
    3: 'EInsufficientBalance - Insufficient balance',
    4: 'EInvalidOutcomeCount - Invalid outcome count',
    5: 'EOutcomeCountExceedsMax - Outcome count exceeds max',
    6: 'EProposalMismatch - Proposal mismatch',
    7: 'EOutcomeNotRegistered - Outcome not registered',
    8: 'EWrongMarket - Wrong market',
  },

  'futarchy_markets_primitives::fee_scheduler': {
    0: 'EInitialFeeTooHigh - Initial fee too high',
    1: 'EDurationTooLong - Duration too long',
    2: 'EDecayOverflow - Decay overflow',
  },

  'futarchy_markets_primitives::futarchy_twap_oracle': {
    0: 'ETimestampRegression - Timestamp regression',
    1: 'ETwapNotStarted - TWAP not started',
    2: 'EZeroPeriod - Zero period',
    3: 'EZeroInitialization - Zero initialization',
    4: 'EZeroStep - Zero step',
    5: 'ELongDelay - Long delay',
    6: 'EStaleTwap - Stale TWAP',
    7: 'EOverflowVRamp - Overflow V ramp',
    8: 'EOverflowVFlat - Overflow V flat',
    9: 'EOverflowSDevMag - Overflow S dev mag',
    10: 'EOverflowBasePriceSumFinal - Overflow base price sum final',
    11: 'EOverflowVSumPricesAdd - Overflow V sum prices add',
    12: 'EInternalTwapError - Internal TWAP error',
    13: 'ENoneFullWindowTwapDelay - None full window TWAP delay',
    14: 'EMarketNotStarted - Market not started',
    15: 'EMarketAlreadyStarted - Market already started',
    16: 'EInvalidCapPpm - Invalid cap PPM',
    17: 'EStepOverflow - Step overflow',
  },

  'futarchy_markets_primitives::market_state': {
    0: 'ETradingAlreadyStarted - Trading already started',
    1: 'EOutcomeOutOfBounds - Outcome out of bounds',
    2: 'EAlreadyFinalized - Already finalized',
    3: 'ETradingAlreadyEnded - Trading already ended',
    4: 'ETradingNotEnded - Trading not ended',
    5: 'ENotFinalized - Not finalized',
    6: 'ETradingNotStarted - Trading not started',
    7: 'EInvalidDuration - Invalid duration',
  },

  // Short alias
  'market_state': {
    0: 'ETradingAlreadyStarted - Trading already started',
    1: 'EOutcomeOutOfBounds - Outcome out of bounds',
    2: 'EAlreadyFinalized - Already finalized',
    3: 'ETradingAlreadyEnded - Trading already ended',
    4: 'ETradingNotEnded - Trading not ended',
    5: 'ENotFinalized - Not finalized',
    6: 'ETradingNotStarted - Trading not started',
    7: 'EInvalidDuration - Invalid duration',
  },

  'futarchy_markets_primitives::PCW_TWAP_oracle': {
    0: 'EOverflow - Overflow',
    1: 'EInvalidConfig - Invalid config',
    2: 'ETimestampRegression - Timestamp regression',
    3: 'ENotInitialized - Not initialized',
    4: 'EInvalidProjection - Invalid projection',
    5: 'EInvalidBackfill - Invalid backfill',
  },

  // =========================================================================
  // LAUNCHPAD ERRORS
  // =========================================================================
  'futarchy_factory::launchpad': {
    1: 'ERaiseNotActive - Raise is not in active funding state',
    2: 'EDeadlineNotReached - Funding deadline has not been reached yet',
    3: 'EMinRaiseNotMet - Minimum raise target was not met',
    4: 'EMinRaiseAlreadyMet - Minimum raise target already met, cannot refund',
    6: 'ENotAContributor - Address is not a contributor to this raise',
    7: 'EInvalidStateForAction - Raise is not in correct state for this action',
    13: 'EZeroContribution - Contribution amount must be greater than zero',
    14: 'EStableTypeNotAllowed - Stable coin type is not in factory allowed list. Deploy test_stable and add it as allowed stable.',
    16: 'EInvalidActionData - Invalid action data provided',
    103: 'ESettlementAlreadyDone - Settlement has already been completed',
    105: 'ECapChangeAfterDeadline - Cannot change caps after deadline',
    109: 'ETooManyUniqueCaps - Too many unique capability types',
    110: 'ETooManyInitActions - Too many initialization actions',
    111: 'EDaoNotPreCreated - DAO has not been pre-created',
    113: 'EIntentsAlreadyLocked - Intents have already been locked',
    114: 'EResourcesNotFound - Required resources not found',
    116: 'EInvalidMaxRaise - Invalid maximum raise amount',
    121: 'EAllowedCapsNotSorted - Allowed caps must be sorted',
    122: 'EAllowedCapsEmpty - Allowed caps list cannot be empty',
    123: 'EIntentsNotLocked - Intents must be locked before this action',
    130: 'ESupplyNotZero - Token supply must be zero',
    132: 'EInvalidCreatorCap - Invalid creator capability',
    133: 'EEarlyCompletionNotAllowed - Early completion is not allowed',
    134: 'EInvalidCrankFee - Invalid crank fee',
    135: 'EBatchSizeTooLarge - Batch size exceeds maximum',
    136: 'EEmptyBatch - Batch cannot be empty',
    137: 'ENoProtocolFeesToSweep - No protocol fees available to sweep',
  },

  // Short alias
  'launchpad': {
    1: 'ERaiseNotActive - Raise is not in active funding state',
    2: 'EDeadlineNotReached - Funding deadline has not been reached yet',
    3: 'EMinRaiseNotMet - Minimum raise target was not met',
    4: 'EMinRaiseAlreadyMet - Minimum raise target already met, cannot refund',
    6: 'ENotAContributor - Address is not a contributor to this raise',
    7: 'EInvalidStateForAction - Raise is not in correct state for this action',
    13: 'EZeroContribution - Contribution amount must be greater than zero',
    14: 'EStableTypeNotAllowed - Stable coin type is not in factory allowed list. Deploy test_stable and add it as allowed stable.',
    16: 'EInvalidActionData - Invalid action data provided',
    103: 'ESettlementAlreadyDone - Settlement has already been completed',
    105: 'ECapChangeAfterDeadline - Cannot change caps after deadline',
    109: 'ETooManyUniqueCaps - Too many unique capability types',
    110: 'ETooManyInitActions - Too many initialization actions',
    111: 'EDaoNotPreCreated - DAO has not been pre-created',
    113: 'EIntentsAlreadyLocked - Intents have already been locked',
    114: 'EResourcesNotFound - Required resources not found',
    116: 'EInvalidMaxRaise - Invalid maximum raise amount',
    121: 'EAllowedCapsNotSorted - Allowed caps must be sorted',
    122: 'EAllowedCapsEmpty - Allowed caps list cannot be empty',
    123: 'EIntentsNotLocked - Intents must be locked before this action',
    130: 'ESupplyNotZero - Token supply must be zero',
    132: 'EInvalidCreatorCap - Invalid creator capability',
    133: 'EEarlyCompletionNotAllowed - Early completion is not allowed',
    134: 'EInvalidCrankFee - Invalid crank fee',
    135: 'EBatchSizeTooLarge - Batch size exceeds maximum',
    136: 'EEmptyBatch - Batch cannot be empty',
    137: 'ENoProtocolFeesToSweep - No protocol fees available to sweep',
  },

  'futarchy_factory::dao_init_executor': {
    1: 'ERaiseIdMismatch - Raise ID mismatch',
  },

  // =========================================================================
  // FACTORY ERRORS
  // =========================================================================
  'futarchy_factory::factory': {
    1: 'EPaused - Factory is paused',
    2: 'EStableTypeNotAllowed - Stable type not allowed',
    3: 'EBadWitness - Bad witness',
    11: 'EInvalidStateForAction - Invalid state for action',
    12: 'EPermanentlyDisabled - Factory is permanently disabled',
    13: 'EAlreadyDisabled - Already disabled',
    14: 'EStableTypeNotAllowed - Stable type not allowed',
  },

  // Short alias
  'factory': {
    1: 'EPaused - Factory is paused',
    2: 'EStableTypeNotAllowed - Stable type not allowed',
    3: 'EBadWitness - Bad witness',
    11: 'EInvalidStateForAction - Invalid state for action',
    12: 'EPermanentlyDisabled - Factory is permanently disabled',
    13: 'EAlreadyDisabled - Already disabled',
    14: 'EStableTypeNotAllowed - Stable type not allowed',
  },

  // =========================================================================
  // PACKAGE REGISTRY ERRORS
  // =========================================================================
  'package_registry': {
    1: 'Package already registered or invalid package ID',
    2: 'Not authorized (missing admin cap)',
  },

  // =========================================================================
  // ACTION VALIDATION ERRORS
  // =========================================================================
  'action_validation': {
    0: 'EActionTypeMismatch - the action type in the staged spec does not match what the do_* function expects',
    1: 'EActionTypeMismatch - the action type in the staged spec does not match what the do_* function expects',
  },

  // =========================================================================
  // PTB EXECUTOR ERRORS (proposal action execution)
  // =========================================================================
  'ptb_executor': {
    0: 'EMarketNotFinalized - Market not finalized',
    1: 'EProposalNotApproved - Winning outcome is 0 (Reject). Actions can only be executed when outcome > 0 (Accept). Make conditional swaps to influence the TWAP in favor of Accept.',
  },

  // =========================================================================
  // COIN REGISTRY ERRORS (conditional coins)
  // =========================================================================
  'coin_registry': {
    0: 'ESupplyNotZero - Coin supply must be zero to deposit',
    1: 'EInsufficientFee - Insufficient fee payment',
    2: 'ERegistryNotEmpty - Registry must be empty for this operation',
    3: 'ENameNotEmpty - Coin name must be empty',
    4: 'EDescriptionNotEmpty - Coin description must be empty',
    5: 'ESymbolNotEmpty - Coin symbol must be empty',
    6: 'EIconUrlNotEmpty - Coin icon URL must be empty',
    7: 'ERegistryFull - Registry is at maximum capacity',
    8: 'EFeeExceedsMaximum - Fee exceeds maximum allowed',
    9: 'ENoCoinSetsAvailable - Coin set not found in registry. The conditional coins may not have been deposited. Run: npm run deploy-conditional-coins',
  },

  'futarchy_one_shot_utils::coin_registry': {
    0: 'ESupplyNotZero - Coin supply must be zero to deposit',
    1: 'EInsufficientFee - Insufficient fee payment',
    2: 'ERegistryNotEmpty - Registry must be empty for this operation',
    3: 'ENameNotEmpty - Coin name must be empty',
    4: 'EDescriptionNotEmpty - Coin description must be empty',
    5: 'ESymbolNotEmpty - Coin symbol must be empty',
    6: 'EIconUrlNotEmpty - Coin icon URL must be empty',
    7: 'ERegistryFull - Registry is at maximum capacity',
    8: 'EFeeExceedsMaximum - Fee exceeds maximum allowed',
    9: 'ENoCoinSetsAvailable - Coin set not found in registry. The conditional coins may not have been deposited. Run: npm run deploy-conditional-coins',
  },

  'futarchy_one_shot_utils::metadata': {
    0: 'EInvalidMetadataLength - Invalid metadata length',
    1: 'EEmptyKey - Empty key',
    2: 'EKeyTooLong - Key too long',
    3: 'EValueTooLong - Value too long',
    4: 'EDuplicateKey - Duplicate key',
  },

  'futarchy_one_shot_utils::math': {
    0: 'EOverflow - Overflow',
    1: 'EDivideByZero - Divide by zero',
    2: 'EValueExceedsU64 - Value exceeds u64',
  },
};
