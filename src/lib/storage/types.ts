/**
 * StorageProvider abstraction — decouples the app from any storage vendor.
 *
 * Implementations:
 *  - LocalStorageProvider: filesystem (dev / single-node).
 *  - S3StorageProvider: S3-compatible APIs — AWS S3, Cloudflare R2, MinIO.
 */
export interface PutOptions {
  contentType?: string;
}

export interface StorageProvider {
  put(key: string, data: Buffer, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Presigned URL when supported; local provider returns null. */
  signedUrl(key: string, ttlSec: number): Promise<string | null>;
}

/** Keys are namespaced by org to keep tenant data separable at rest. */
export function datasetKey(orgId: string, datasetId: string, variant: "original" | "parquet", filename: string): string {
  return `orgs/${orgId}/datasets/${datasetId}/${variant}/${filename}`;
}
