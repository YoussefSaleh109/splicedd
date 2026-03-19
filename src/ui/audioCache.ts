/**
 * In-memory cache for decoded audio previews.
 * Key: sample UUID, Value: decoded audio as Blob URL
 */
const cache = new Map<string, string>();

export function getCachedAudio(uuid: string): string | null {
  return cache.get(uuid) ?? null;
}

export function setCachedAudio(uuid: string, blobUrl: string): void {
  cache.set(uuid, blobUrl);
}

export function hasCachedAudio(uuid: string): boolean {
  return cache.has(uuid);
}
