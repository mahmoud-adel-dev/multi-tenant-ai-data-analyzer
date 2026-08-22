const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadEnvConfig } = require("@next/env");

const root = __dirname;
const analyticsRoot = path.join(root, "analytics-service");
loadEnvConfig(root, true);

function commandPath(name) {
  const lookup = process.platform === "win32"
    ? spawnSync("where.exe", [name], { encoding: "utf8", windowsHide: true })
    : spawnSync("which", [name], { encoding: "utf8" });
  if (lookup.status !== 0) return null;
  return lookup.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function canImportUvicorn(executable, prefixArgs = []) {
  const result = spawnSync(
    executable,
    [...prefixArgs, "-c", "import uvicorn"],
    { cwd: analyticsRoot, encoding: "utf8", timeout: 10_000, windowsHide: true }
  );
  return result.status === 0;
}

function resolvePython() {
  const configured = process.env.AIDL_PYTHON?.trim();
  const localCandidates = process.platform === "win32"
    ? [
        path.join(analyticsRoot, ".venv", "Scripts", "python.exe"),
        path.join(analyticsRoot, "venv", "Scripts", "python.exe"),
        path.join(root, ".venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(analyticsRoot, ".venv", "bin", "python"),
        path.join(analyticsRoot, "venv", "bin", "python"),
        path.join(root, ".venv", "bin", "python"),
      ];

  const candidates = [
    ...(configured ? [{ executable: configured, prefixArgs: [] }] : []),
    ...localCandidates.filter((candidate) => fs.existsSync(candidate)).map((executable) => ({ executable, prefixArgs: [] })),
    ...(process.platform === "win32"
      ? [
          { executable: commandPath("py"), prefixArgs: ["-3"] },
          { executable: commandPath("python"), prefixArgs: [] },
        ]
      : [
          { executable: commandPath("python3"), prefixArgs: [] },
          { executable: commandPath("python"), prefixArgs: [] },
        ]),
  ].filter((candidate) => candidate.executable);

  for (const candidate of candidates) {
    if (canImportUvicorn(candidate.executable, candidate.prefixArgs)) return candidate;
  }

  throw new Error(
    [
      "Python with uvicorn is required to start aidl-analytics.",
      "Create analytics-service/.venv and install: pip install -e \".[dev]\"",
      "Or set AIDL_PYTHON to the full path of a Python executable that can import uvicorn.",
    ].join(" ")
  );
}

function selectedEnv(names) {
  return Object.fromEntries(
    names
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]])
  );
}

const commonEnv = selectedEnv([
  "MONGODB_URI",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "APP_ENCRYPTION_KEY",
  "STORAGE_DRIVER",
  "STORAGE_LOCAL_PATH",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "ANALYTICS_SERVICE_URL",
  "ANALYTICS_API_TOKEN",
  "ANALYTICS_TIMEOUT_MS",
  "REDIS_URL",
  "LOG_LEVEL",
]);
const analyticsEnv = selectedEnv([
  "ANALYTICS_API_TOKEN",
  "ANALYTICS_MAX_UPLOAD_BYTES",
  "ANALYTICS_MAX_ROWS",
  "ANALYTICS_MAX_COLUMNS",
  "ANALYTICS_MAX_EXCEL_MB",
]);
const python = resolvePython();

const base = {
  namespace: "aidl-dev",
  cwd: root,
  exec_mode: "fork",
  instances: 1,
  autorestart: true,
  watch: false,
  restart_delay: 2_000,
  min_uptime: "5s",
  max_restarts: 10,
  kill_timeout: 10_000,
  time: true,
  merge_logs: true,
};
module.exports = {
  apps: [
    {
      ...base,
      name: "aidl-web",
      script: path.join(root, "node_modules", "next", "dist", "bin", "next"),
      args: "dev -p 3001",
      interpreter: process.execPath,
      env_development: {
        ...commonEnv,
        NODE_ENV: "development",
        PORT: "3001",
        NEXTAUTH_URL: "http://localhost:3001",
      },
    },
    {
      ...base,
      name: "aidl-worker",
      script: path.join(root, "dist-worker", "index.mjs"),
      interpreter: process.execPath,
      // Large payloads inflate the heap; recycle instead of degrading.
      max_memory_restart: "1G",
      env_development: {
        ...commonEnv,
        NODE_ENV: "development",
      },
    },
    {
      ...base,
      name: "aidl-analytics",
      cwd: analyticsRoot,
      script: python.executable,
      args: [
        ...python.prefixArgs,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--reload",
      ],
      interpreter: "none",
      env_development: {
        ...analyticsEnv,
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
