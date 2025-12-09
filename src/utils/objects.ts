import { SuiClient } from '@mysten/sui/client';

/**
 * Get the Move type of an object
 *
 * @param client - Sui client instance
 * @param objectId - Object ID to query
 * @returns Full type string
 */
export async function getObjectType(client: SuiClient, objectId: string): Promise<string> {
  const obj = await client.getObject({
    id: objectId,
    options: { showType: true },
  });

  if (!obj.data?.type) {
    throw new Error(`Could not determine type for object: ${objectId}`);
  }

  return obj.data.type;
}
