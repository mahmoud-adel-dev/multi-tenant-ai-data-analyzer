/**
 * @file src/lib/db.ts
 * @description Robust MongoDB connection utility using Mongoose.
 *
 * PROBLEM SOLVED:
 * In Next.js development mode, the module system hot-reloads on every file
 * save, which would normally create a new Mongoose connection on each reload,
 * quickly exhausting the MongoDB Atlas connection pool.
 *
 * SOLUTION:
 * We cache the Mongoose connection promise on the Node.js `global` object.
 * The `global` object persists across hot-reloads within the same Node.js
 * process, so the connection is established once and reused thereafter.
 */

import mongoose from "mongoose";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const MONGODB_URI = getEnv().MONGODB_URI;

/**
 * @interface MongooseCache
 * Defines the shape of the cached Mongoose connection stored on the global object.
 */
interface MongooseCache {
  /** The active Mongoose connection instance, or null if not yet connected. */
  conn: typeof mongoose | null;
  /** The pending connection promise, or null if no connection is in progress. */
  promise: Promise<typeof mongoose> | null;
}

/**
 * Augment the global Node.js namespace to include our custom cache property.
 * This prevents TypeScript from complaining about a non-existent property on `global`.
 */
declare global {
  var mongoose: MongooseCache | undefined;
}

/**
 * Retrieve the cached connection from the global object, or initialize a new
 * cache entry if this is the first time the module is loaded.
 */
const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

// Write the cache back to global so it persists across hot-reloads.
global.mongoose = cached;

/**
 * Establishes a connection to MongoDB and returns the Mongoose instance.
 * If a connection already exists (or is pending), it returns the cached one.
 *
 * @returns {Promise<typeof mongoose>} The connected Mongoose instance.
 * @example
 * // In a Server Action or Route Handler:
 * import connectDB from "@/lib/db";
 * await connectDB();
 */
async function connectDB(): Promise<typeof mongoose> {
  // 1. If we already have an active connection, return it immediately.
  if (cached.conn) {
    return cached.conn;
  }

  // 2. If a connection attempt is already in progress, wait for it to resolve.
  //    This prevents race conditions where multiple requests try to connect simultaneously.
  if (!cached.promise) {
    const options: mongoose.ConnectOptions = {
      /**
       * Mongoose buffers model calls until the connection is ready.
       * Setting bufferCommands to false throws immediately if not connected,
       * which gives clearer error messages during development.
       */
      bufferCommands: false,

      /**
       * dbName is optional; the database name can also be specified in the URI.
       * Leaving it out defaults to the name in the URI string.
       */
    };

    // 3. Create the connection promise and cache it.
    cached.promise = mongoose
      .connect(MONGODB_URI, options)
      .then((mongooseInstance) => {
        logger.info("MongoDB connected", { service: "db" });
        return mongooseInstance;
      })
      .catch((error) => {
        // Reset the promise cache on failure so the next call can retry.
        cached.promise = null;
        logger.error("MongoDB connection failed", { error: String(error), service: "db" });
        throw error;
      });
  }

  // 4. Await the pending promise and cache the resolved connection.
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
