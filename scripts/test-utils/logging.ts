/**
 * Test Logging Utilities
 *
 * Consistent logging helpers for E2E tests.
 */

/**
 * Log a section header
 */
export function logSection(title: string): void {
  console.log("=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
  console.log();
}

/**
 * Log a numbered step
 */
export function logStep(step: number, title: string): void {
  console.log("=".repeat(80));
  console.log(`STEP ${step}: ${title}`);
  console.log("=".repeat(80));
  console.log();
}

/**
 * Log a success message
 */
export function logSuccess(message: string): void {
  console.log(`✅ ${message}`);
}

/**
 * Log an info message
 */
export function logInfo(message: string): void {
  console.log(`ℹ️  ${message}`);
}

/**
 * Log an error message
 */
export function logError(message: string): void {
  console.error(`❌ ${message}`);
}

/**
 * Log a warning message
 */
export function logWarning(message: string): void {
  console.warn(`⚠️  ${message}`);
}

/**
 * Log a debug message (only in verbose mode)
 */
export function logDebug(message: string): void {
  if (process.env.VERBOSE === 'true' || process.env.DEBUG === 'true') {
    console.log(`🔍 ${message}`);
  }
}

/**
 * Log transaction details
 */
export function logTransaction(label: string, digest: string): void {
  console.log(`📝 ${label}: ${digest}`);
}

/**
 * Log object ID
 */
export function logObject(label: string, objectId: string): void {
  console.log(`📦 ${label}: ${objectId}`);
}

/**
 * Create a progress logger for tracking multi-step operations
 */
export function createProgressLogger(totalSteps: number, prefix: string = "") {
  let currentStep = 0;

  return {
    next(message: string): void {
      currentStep++;
      const percent = Math.round((currentStep / totalSteps) * 100);
      console.log(`${prefix}[${currentStep}/${totalSteps}] (${percent}%) ${message}`);
    },
    done(message: string): void {
      console.log(`${prefix}✅ ${message}`);
    },
    error(message: string): void {
      console.error(`${prefix}❌ ${message}`);
    },
  };
}
