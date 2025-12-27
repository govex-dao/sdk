/**
 * Action Configuration Types
 *
 * Re-exports all action configs and the ActionConfig union type.
 *
 * @module workflows/types/actions
 */

// Account actions
export type {
  CreateStreamActionConfig,
  CancelStreamActionConfig,
  DepositActionConfig,
  SpendActionConfig,
  ApproveCoinTypeActionConfig,
  RemoveApprovedCoinTypeActionConfig,
  DepositFromResourcesActionConfig,
  ReturnTreasuryCapActionConfig,
  ReturnMetadataActionConfig,
  MintActionConfig,
  BurnActionConfig,
  DisableCurrencyActionConfig,
  UpdateCurrencyActionConfig,
  TransferActionConfig,
  TransferToSenderActionConfig,
  TransferCoinActionConfig,
  TransferCoinToSenderActionConfig,
  UpgradePackageActionConfig,
  CommitUpgradeActionConfig,
  RestrictUpgradeActionConfig,
  CreateCommitCapActionConfig,
  MemoActionConfig,
} from './account';

// Futarchy actions
export type {
  SetProposalsEnabledActionConfig,
  TerminateDaoActionConfig,
  UpdateDaoNameActionConfig,
  UpdateTradingParamsActionConfig,
  UpdateDaoMetadataActionConfig,
  UpdateTwapConfigActionConfig,
  UpdateGovernanceActionConfig,
  UpdateMetadataTableActionConfig,
  UpdateConditionalMetadataActionConfig,
  UpdateSponsorshipConfigActionConfig,
  SetQuotasActionConfig,
  CreatePoolWithMintActionConfig,
  AddLiquidityActionConfig,
  RemoveLiquidityToResourcesActionConfig,
  SwapActionConfig,
  CreateDissolutionCapabilityActionConfig,
} from './futarchy';

// Governance actions
export type {
  AddPackageActionConfig,
  RemovePackageActionConfig,
  UpdatePackageVersionActionConfig,
  UpdatePackageMetadataActionConfig,
  PauseAccountCreationActionConfig,
  UnpauseAccountCreationActionConfig,
  SetFactoryPausedActionConfig,
  DisableFactoryPermanentlyActionConfig,
  AddStableTypeActionConfig,
  RemoveStableTypeActionConfig,
  UpdateDaoCreationFeeActionConfig,
  UpdateProposalFeeActionConfig,
  UpdateVerificationFeeActionConfig,
  AddVerificationLevelActionConfig,
  RemoveVerificationLevelActionConfig,
  WithdrawFeesToTreasuryActionConfig,
  AddCoinFeeConfigActionConfig,
  UpdateCoinCreationFeeActionConfig,
  UpdateCoinProposalFeeActionConfig,
  ApplyPendingCoinFeesActionConfig,
} from './governance';

// Oracle actions
export type {
  CreateOracleGrantActionConfig,
  CancelOracleGrantActionConfig,
} from './oracle';

// Import types for the union
import type {
  CreateStreamActionConfig,
  CancelStreamActionConfig,
  DepositActionConfig,
  SpendActionConfig,
  ApproveCoinTypeActionConfig,
  RemoveApprovedCoinTypeActionConfig,
  DepositFromResourcesActionConfig,
  ReturnTreasuryCapActionConfig,
  ReturnMetadataActionConfig,
  MintActionConfig,
  BurnActionConfig,
  DisableCurrencyActionConfig,
  UpdateCurrencyActionConfig,
  TransferActionConfig,
  TransferToSenderActionConfig,
  TransferCoinActionConfig,
  TransferCoinToSenderActionConfig,
  UpgradePackageActionConfig,
  CommitUpgradeActionConfig,
  RestrictUpgradeActionConfig,
  CreateCommitCapActionConfig,
  MemoActionConfig,
} from './account';

import type {
  SetProposalsEnabledActionConfig,
  TerminateDaoActionConfig,
  UpdateDaoNameActionConfig,
  UpdateTradingParamsActionConfig,
  UpdateDaoMetadataActionConfig,
  UpdateTwapConfigActionConfig,
  UpdateGovernanceActionConfig,
  UpdateMetadataTableActionConfig,
  UpdateConditionalMetadataActionConfig,
  UpdateSponsorshipConfigActionConfig,
  SetQuotasActionConfig,
  CreatePoolWithMintActionConfig,
  AddLiquidityActionConfig,
  RemoveLiquidityToResourcesActionConfig,
  SwapActionConfig,
  CreateDissolutionCapabilityActionConfig,
} from './futarchy';

import type {
  AddPackageActionConfig,
  RemovePackageActionConfig,
  UpdatePackageVersionActionConfig,
  UpdatePackageMetadataActionConfig,
  PauseAccountCreationActionConfig,
  UnpauseAccountCreationActionConfig,
  SetFactoryPausedActionConfig,
  DisableFactoryPermanentlyActionConfig,
  AddStableTypeActionConfig,
  RemoveStableTypeActionConfig,
  UpdateDaoCreationFeeActionConfig,
  UpdateProposalFeeActionConfig,
  UpdateVerificationFeeActionConfig,
  AddVerificationLevelActionConfig,
  RemoveVerificationLevelActionConfig,
  WithdrawFeesToTreasuryActionConfig,
  AddCoinFeeConfigActionConfig,
  UpdateCoinCreationFeeActionConfig,
  UpdateCoinProposalFeeActionConfig,
  ApplyPendingCoinFeesActionConfig,
} from './governance';

import type {
  CreateOracleGrantActionConfig,
  CancelOracleGrantActionConfig,
} from './oracle';

/**
 * Union of all action configurations for staging
 */
export type ActionConfig =
  // Stream
  | CreateStreamActionConfig
  | CancelStreamActionConfig
  // Vault
  | DepositActionConfig
  | SpendActionConfig
  | ApproveCoinTypeActionConfig
  | RemoveApprovedCoinTypeActionConfig
  | DepositFromResourcesActionConfig
  // Currency
  | ReturnTreasuryCapActionConfig
  | ReturnMetadataActionConfig
  | MintActionConfig
  | BurnActionConfig
  | DisableCurrencyActionConfig
  | UpdateCurrencyActionConfig
  // Transfer (objects via provide_object)
  | TransferActionConfig
  | TransferToSenderActionConfig
  // Transfer (coins via provide_coin)
  | TransferCoinActionConfig
  | TransferCoinToSenderActionConfig
  // Package Upgrade
  | UpgradePackageActionConfig
  | CommitUpgradeActionConfig
  | RestrictUpgradeActionConfig
  | CreateCommitCapActionConfig
  // Memo
  | MemoActionConfig
  // Futarchy Config
  | SetProposalsEnabledActionConfig
  | TerminateDaoActionConfig
  | UpdateDaoNameActionConfig
  | UpdateTradingParamsActionConfig
  | UpdateDaoMetadataActionConfig
  | UpdateTwapConfigActionConfig
  | UpdateGovernanceActionConfig
  | UpdateMetadataTableActionConfig
  | UpdateConditionalMetadataActionConfig
  | UpdateSponsorshipConfigActionConfig
  // Futarchy Quota
  | SetQuotasActionConfig
  // Futarchy Liquidity
  | CreatePoolWithMintActionConfig
  | AddLiquidityActionConfig
  | RemoveLiquidityToResourcesActionConfig
  | SwapActionConfig
  // Futarchy Dissolution
  | CreateDissolutionCapabilityActionConfig
  // Governance - Package Registry
  | AddPackageActionConfig
  | RemovePackageActionConfig
  | UpdatePackageVersionActionConfig
  | UpdatePackageMetadataActionConfig
  | PauseAccountCreationActionConfig
  | UnpauseAccountCreationActionConfig
  // Governance - Protocol Admin
  | SetFactoryPausedActionConfig
  | DisableFactoryPermanentlyActionConfig
  | AddStableTypeActionConfig
  | RemoveStableTypeActionConfig
  | UpdateDaoCreationFeeActionConfig
  | UpdateProposalFeeActionConfig
  | UpdateVerificationFeeActionConfig
  | AddVerificationLevelActionConfig
  | RemoveVerificationLevelActionConfig
  | WithdrawFeesToTreasuryActionConfig
  | AddCoinFeeConfigActionConfig
  | UpdateCoinCreationFeeActionConfig
  | UpdateCoinProposalFeeActionConfig
  | ApplyPendingCoinFeesActionConfig
  // Oracle
  | CreateOracleGrantActionConfig
  | CancelOracleGrantActionConfig;
