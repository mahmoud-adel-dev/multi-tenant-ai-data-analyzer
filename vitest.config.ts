import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Test-time environment; individual suites override as needed.
      MONGODB_URI: "mongodb://localhost:27017/test",
      NEXTAUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      APP_ENCRYPTION_KEY: "a".repeat(64),
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_PATH: "./.tmp-test-storage",
      VITEST: "true",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
