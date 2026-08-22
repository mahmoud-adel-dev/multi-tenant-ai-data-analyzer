const targets = [
  { name: "AIDL web", url: "http://127.0.0.1:3001/api/health" },
  { name: "Analytics", url: "http://127.0.0.1:8000/healthz" },
];
const deadline = Date.now() + 90_000;

async function probe(target) {
  try {
    const response = await fetch(target.url, { signal: AbortSignal.timeout(2_500) });
    return response.ok;
  } catch {
    return false;
  }
}

const pending = new Map(targets.map((target) => [target.name, target]));
while (pending.size > 0 && Date.now() < deadline) {
  for (const [name, target] of pending) {
    if (await probe(target)) {
      console.log(`Ready: ${name} (${target.url})`);
      pending.delete(name);
    }
  }
  if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
}

if (pending.size > 0) {
  console.error(`Services did not become ready: ${[...pending.keys()].join(", ")}`);
  console.error("Inspect them with: npm run dev:all:logs");
  process.exit(1);
}

console.log("All AIDL development services are ready.");
