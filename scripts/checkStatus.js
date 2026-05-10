const path = require("path");
const fs = require("fs/promises");
const { execFileSync } = require("child_process");

const STORAGE_DIR = path.join(process.env.HOME, ".openclaw", "billions");
const RPC_URL = "https://rpc-mainnet.billions.network";
const MIN_NODE_MAJOR = 20;

const STORAGE_FILES = [
  { name: "kms.json", description: "Private keys" },
  { name: "identities.json", description: "Identity metadata" },
  { name: "defaultDid.json", description: "Active DID" },
  { name: "challenges.json", description: "Challenge history" },
  { name: "credentials.json", description: "Verifiable credentials" },
];

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major >= MIN_NODE_MAJOR) {
    return { pass: true, detail: `v${process.versions.node}` };
  }
  return {
    pass: false,
    detail: `v${process.versions.node} (requires >= v${MIN_NODE_MAJOR})`,
  };
}

function checkOpenclawCli() {
  try {
    const version = execFileSync("openclaw", ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return { pass: true, detail: version || "installed" };
  } catch {
    return { pass: false, detail: "not found in PATH" };
  }
}

async function checkStorageFiles() {
  const results = [];
  for (const file of STORAGE_FILES) {
    const filePath = path.join(STORAGE_DIR, file.name);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      const count = Array.isArray(parsed) ? parsed.length : 1;
      results.push({
        name: file.name,
        pass: true,
        detail: `${count} ${count === 1 ? "entry" : "entries"}`,
      });
    } catch (err) {
      if (err.code === "ENOENT") {
        results.push({ name: file.name, pass: null, detail: "not created yet" });
      } else {
        results.push({ name: file.name, pass: false, detail: err.message });
      }
    }
  }
  return results;
}

async function checkIdentities() {
  const filePath = path.join(STORAGE_DIR, "defaultDid.json");
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const entries = JSON.parse(data);
    if (!Array.isArray(entries) || entries.length === 0) {
      return { pass: null, identities: [], defaultDid: null };
    }
    const defaultEntry = entries.find((e) => e.isDefault);
    return {
      pass: true,
      identities: entries,
      defaultDid: defaultEntry ? defaultEntry.did : null,
    };
  } catch {
    return { pass: null, identities: [], defaultDid: null };
  }
}

async function checkRpcConnection() {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const json = await response.json();
    if (json.result) {
      const chainId = parseInt(json.result, 16);
      return { pass: true, detail: `chain ID ${chainId}` };
    }
    return { pass: false, detail: "unexpected response" };
  } catch (err) {
    return { pass: false, detail: err.message };
  }
}

function icon(status) {
  if (status === true) return "[PASS]";
  if (status === false) return "[FAIL]";
  return "[SKIP]";
}

async function main() {
  console.log("=== Billions Agent Identity - Status Check ===\n");

  // 1. Node.js version
  const node = checkNodeVersion();
  console.log(`${icon(node.pass)} Node.js version: ${node.detail}`);

  // 2. openclaw CLI
  const openclaw = checkOpenclawCli();
  console.log(`${icon(openclaw.pass)} openclaw CLI: ${openclaw.detail}`);

  // 3. Billions Network RPC
  const rpc = await checkRpcConnection();
  console.log(`${icon(rpc.pass)} Billions RPC: ${rpc.detail}`);

  // 4. Storage files
  console.log(`\n--- Storage (${STORAGE_DIR}) ---`);
  const storageResults = await checkStorageFiles();
  for (const result of storageResults) {
    console.log(`${icon(result.pass)} ${result.name}: ${result.detail}`);
  }

  // 5. Identities
  const ids = await checkIdentities();
  console.log("\n--- Identities ---");
  if (ids.identities.length === 0) {
    console.log(
      "[SKIP] No identities found. Run createNewEthereumIdentity.js to create one.",
    );
  } else {
    console.log(`Found ${ids.identities.length} identity(ies):`);
    for (const entry of ids.identities) {
      const tag = entry.isDefault ? " (default)" : "";
      console.log(`  - ${entry.did}${tag}`);
    }
  }

  // Summary
  const checks = [node, openclaw, rpc];
  const failed = checks.filter((c) => c.pass === false);
  console.log("\n--- Summary ---");
  if (failed.length === 0) {
    console.log("All checks passed. Your environment is ready.");
  } else {
    console.log(`${failed.length} check(s) failed. Review the output above.`);
    process.exit(1);
  }
}

main();
