/**
 * Object Reference Utilities for E2E Tests
 *
 * Provides network-aware object reference handling for Sui transactions.
 * On localnet, returns full refs (SharedObjectRef/OwnedObjectRef) to avoid RPC lookups.
 * On other networks, returns string IDs since indexer is fast enough.
 */

import type { OwnedObjectRef, TxSharedObjectRef, ObjectIdOrRef } from "../../src/workflows/types";

/**
 * Check if an object from transaction result is shared
 */
export function isSharedObject(obj: any): boolean {
  return obj?.owner && typeof obj.owner === 'object' && 'Shared' in obj.owner;
}

/**
 * Extract object ref from transaction result by type pattern.
 * On localnet, returns full ref (SharedObjectRef for shared, OwnedObjectRef for owned).
 * On other networks, returns string ID.
 */
export function getObjectRef(
  result: any,
  typePattern: string,
  network: string
): ObjectIdOrRef | undefined {
  const obj = result.objectChanges?.find((c: any) =>
    c.objectType?.includes(typePattern)
  );
  if (!obj) return undefined;

  return toObjectRef(obj, network);
}

/**
 * Extract object ref from transaction result by object ID.
 * On localnet, returns full ref (SharedObjectRef for shared, OwnedObjectRef for owned).
 * On other networks, returns string ID.
 */
export function getObjectRefById(
  result: any,
  objectId: string,
  network: string
): ObjectIdOrRef {
  const obj = result.objectChanges?.find((c: any) => c.objectId === objectId);

  if (obj) {
    return toObjectRef(obj, network);
  }
  return objectId;
}

/**
 * Convert a transaction object change to an ObjectIdOrRef based on network.
 * Internal helper used by getObjectRef and getObjectRefById.
 */
function toObjectRef(obj: any, network: string): ObjectIdOrRef {
  // On localnet, return full ref to avoid RPC lookup
  if (isLocalnet(network)) {
    if (isSharedObject(obj)) {
      return {
        objectId: obj.objectId,
        initialSharedVersion: obj.owner.Shared.initial_shared_version,
        mutable: true,
      } as TxSharedObjectRef;
    }
    return {
      objectId: obj.objectId,
      version: obj.version,
      digest: obj.digest,
    } as OwnedObjectRef;
  }
  return obj.objectId;
}

/**
 * Get the string object ID from an ObjectIdOrRef
 */
export function getObjId(ref: ObjectIdOrRef): string {
  return typeof ref === 'string' ? ref : ref.objectId;
}

/**
 * Check if running on localnet (where indexer is slow)
 */
export function isLocalnet(network: string): boolean {
  return network === 'localnet';
}

/**
 * Get all created objects of a specific type from transaction result
 */
export function getCreatedObjectsOfType(
  result: any,
  typePattern: string,
  network: string
): ObjectIdOrRef[] {
  const objs = result.objectChanges?.filter((c: any) =>
    c.type === 'created' && c.objectType?.includes(typePattern)
  ) || [];

  return objs.map((obj: any) => toObjectRef(obj, network));
}

/**
 * Get all mutated objects of a specific type from transaction result
 */
export function getMutatedObjectsOfType(
  result: any,
  typePattern: string,
  network: string
): ObjectIdOrRef[] {
  const objs = result.objectChanges?.filter((c: any) =>
    c.type === 'mutated' && c.objectType?.includes(typePattern)
  ) || [];

  return objs.map((obj: any) => toObjectRef(obj, network));
}
