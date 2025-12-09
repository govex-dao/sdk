/**
 * Admin Operations - Privileged operations requiring special capabilities
 *
 * These operations require admin capabilities (AdminCap, ValidatorAdminCap, etc.)
 * and are not available to regular users.
 *
 * @module admin
 */

import { SDKConfigWithObjects } from '@/types';
import { VerificationService } from './verification';
import { FactoryService } from './factory';
import { PackageRegistryService } from './package-registry';
import { FeeManagerService } from './fee-manager';


/**
 * AdminService - Unified interface for all admin operations
 *
 * This service encapsulates all privileged operations requiring admin capabilities.
 * Access individual operation modules through the exposed properties.
 *
 * @example
 * ```typescript
 * const adminService = new AdminService(client, packages, sharedObjects);
 *
 * // Toggle factory pause
 * const tx = adminService.factory.togglePause(ownerCapId);
 *
 * // Approve verification
 * const tx2 = adminService.validator.approveVerification({...}, validatorCapId);
 *
 * // Pause account creation
 * const tx3 = adminService.packageRegistry.pauseAccountCreation(adminCapId);
 *
 * // Update fees
 * const tx4 = adminService.feeManager.updateDaoCreationFee(100n, adminCapId);
 * ```
 */
export class AdminService {
    /** Factory admin operations (requires FactoryOwnerCap) */
    public readonly factory: FactoryService;

    /** Factory validator operations (requires ValidatorAdminCap) */
    public readonly verification: VerificationService;

    /** Package registry admin operations (requires PackageAdminCap) */
    public readonly packageRegistry: PackageRegistryService;

    /** Fee manager operations (requires FeeAdminCap) */
    public readonly feeManager: FeeManagerService;

    constructor({client, packages, sharedObjects}: SDKConfigWithObjects) {
        this.factory = new FactoryService(
            client,
            packages.futarchyFactory,
            sharedObjects.factory.id,
            sharedObjects.factory.version,
            sharedObjects.packageRegistry.id
        );

        this.verification = new VerificationService(
            client,
            packages.futarchyFactory,
            sharedObjects.packageRegistry.id
        );

        this.packageRegistry = new PackageRegistryService(
            client,
            packages.accountProtocol,
            sharedObjects.packageRegistry.id,
            sharedObjects.packageRegistry.version
        );

        this.feeManager = new FeeManagerService(
            client,
            sharedObjects.feeManager.id,
            packages.futarchyMarketsCore
        );
    }
}
