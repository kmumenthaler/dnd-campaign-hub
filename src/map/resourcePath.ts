/**
 * Browser image/video elements can keep an old decoded bitmap when a vault
 * file is replaced at the same path. Add a stable version query derived from
 * map metadata so background swaps reload when dimensions/modified timestamps
 * change, while staying cacheable between unchanged renders.
 */
export function versionMapResourcePath(resourcePath: string, config: any): string {
  if (!resourcePath) return resourcePath;

  const versionKey = [
    config?.imageFile || '',
    config?.dimensions?.width || '',
    config?.dimensions?.height || '',
    config?.lastModified || '',
    config?.templateSyncedAt || '',
  ].join('|');

  let hash = 5381;
  for (let i = 0; i < versionKey.length; i++) {
    hash = ((hash << 5) + hash + versionKey.charCodeAt(i)) | 0;
  }

  const [withoutHash = resourcePath, hashPart] = resourcePath.split('#', 2);
  const separator = withoutHash.includes('?') ? '&' : '?';
  const versioned = `${withoutHash}${separator}dndHubMapV=${Math.abs(hash)}`;
  return hashPart ? `${versioned}#${hashPart}` : versioned;
}
