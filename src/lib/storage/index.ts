/**
 * Storage singleton. Driver selected by STORAGE_DRIVER env (local|s3).
 */
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";

const globalForStorage = globalThis as unknown as { __storage?: StorageProvider };

export function getStorage(): StorageProvider {
  if (!globalForStorage.__storage) {
    const env = getEnv();
    if (env.STORAGE_DRIVER === "s3") {
      globalForStorage.__storage = new S3StorageProvider();
      logger.info("Object storage: s3", { bucket: env.S3_BUCKET });
    } else {
      globalForStorage.__storage = new LocalStorageProvider();
      logger.info("Object storage: local-filesystem", {});
    }
  }
  return globalForStorage.__storage;
}

export type { StorageProvider } from "./types";
export { datasetKey } from "./types";
