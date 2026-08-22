/**
 * Local filesystem storage provider (development / single-node deployments).
 * Keys are mapped to paths under STORAGE_LOCAL_PATH with traversal protection.
 */
import { promises as fs } from "fs";
import path from "path";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private root(): string {
    return path.resolve(process.cwd(), getEnv().STORAGE_LOCAL_PATH);
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root(), key);
    if (!full.startsWith(this.root() + path.sep) && full !== this.root()) {
      throw new AppError("VALIDATION_ERROR", "Invalid storage key.");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(): Promise<string | null> {
    // Local storage cannot serve presigned URLs; callers must stream bytes.
    return null;
  }
}
