/**
 * Composite Validators
 *
 * Higher-level validators that combine multiple basic validators.
 *
 * @module utils/validators/composite
 */

import { SDKValidationError } from './error';
import { validateSuiAddress } from './address';
import { validatePositiveAmount, validateNonNegativeAmount } from './amounts';
import { validateStringLength, validateVaultName } from './strings';
import { validateTimestampMs, validateDurationMs } from './time';
import { validateNonEmptyArray } from './arrays';
import { validateBoolean } from './misc';

/**
 * Validate stream creation parameters
 */
export function validateStreamParams(params: {
  vaultName: string;
  beneficiary: string;
  amountPerIteration: bigint;
  startTime: number;
  iterationsTotal: bigint;
  iterationPeriodMs: bigint;
  cliffTime?: number;
  maxPerWithdrawal: bigint;
}): void {
  validateVaultName(params.vaultName);
  validateSuiAddress(params.beneficiary, 'beneficiary');
  validatePositiveAmount(params.amountPerIteration, 'amountPerIteration');
  validateTimestampMs(params.startTime, 'startTime');
  validatePositiveAmount(params.iterationsTotal, 'iterationsTotal');
  validateDurationMs(params.iterationPeriodMs, 'iterationPeriodMs');

  if (params.cliffTime !== undefined) {
    validateTimestampMs(params.cliffTime, 'cliffTime');
    if (params.cliffTime < params.startTime) {
      throw new SDKValidationError(
        `cliffTime (${params.cliffTime}) must be >= startTime (${params.startTime})`,
        'cliffTime',
        params.cliffTime
      );
    }
  }

  validatePositiveAmount(params.maxPerWithdrawal, 'maxPerWithdrawal');
}

/**
 * Validate oracle grant tier spec
 */
export function validateTierSpec(tier: {
  priceThreshold: bigint;
  isAbove: boolean;
  recipients: Array<{ address: string; amount: bigint }>;
  description: string;
}): void {
  validateNonNegativeAmount(tier.priceThreshold, 'priceThreshold');
  validateBoolean(tier.isAbove, 'isAbove');
  validateNonEmptyArray(tier.recipients, 'recipients');
  validateStringLength(tier.description, 1, 256, 'description');

  tier.recipients.forEach((r, i) => {
    validateSuiAddress(r.address, `recipients[${i}].address`);
    validatePositiveAmount(r.amount, `recipients[${i}].amount`);
  });
}
