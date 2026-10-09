#!/usr/bin/env node
/**
 * One-command stack deploy: Caddy + Headscale + Otterscale app (SQLite).
 * - Ensures .env (AUTH_SECRET, SQLite DATABASE_URL, public Headscale URL)
 * - Builds images and starts Compose
 * - Bootstraps Headscale user + API key into .env when HEADSCALE_API_KEY is empty
 * - App container runs `prisma migrate deploy` on start (see deploy/docker-entrypoint.sh)
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");
const envExamplePath = path.join(repoRoot, ".env.example");

function composeArgs() {
  return [
    "-p",
    "otterscale",
    "-f",
    path.join(repoRoot, "deploy/docker-compose.yml"),
    "--env-file",
    envPath,
  ];
}

const STACK_DATABASE_URL = "file:/data/otterscale.db";
const HEADSCALE_DEFAULT_USER = "tagged-devices";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: opts.quiet ? "pipe" : "inherit",
    encoding: "utf8",
    // Windows needs a shell for `docker compose`; probes pass argv arrays with
    // colons/spaces and must use shell:false so cmd.exe does not rewrite them.
    shell: opts.shell ?? process.platform === "win32",
    env: { ...process.env, ...opts.env },
    windowsHide: true,
  });
  if (res.status !== 0) {
    const detail = res.stderr?.trim() || res.stdout?.trim();
    throw new Error(
      `${cmd} ${args[0] ?? ""} failed (exit ${res.status})${detail ? `: ${detail.slice(0, 400)}` : ""}`,
    );
  }
  return res.stdout ?? "";
}

function compose(args, opts = {}) {
  return run("docker", ["compose", ...composeArgs(), ...args], opts);
}

function parseEnvFile(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

function serializeEnvFile(original, updates) {
  const lines = original.split(/\r?\n/);
  const seen = new Set();
  const out = [];

  for (const line of lines) {
    if (!line || line.trimStart().startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (updates.has(key)) {
      out.push(`${key}=${updates.get(key)}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }

  for (const [key, val] of updates) {
    if (!seen.has(key)) out.push(`${key}=${val}`);
  }

  return out.join("\n").replace(/\n?$/, "\n");
}

function loadEnv() {
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log("Created .env from .env.example");
    } else {
      fs.writeFileSync(envPath, "", "utf8");
    }
  }
  return fs.readFileSync(envPath, "utf8");
}

function ensureEnvDefaults(content) {
  const map = parseEnvFile(content);
  const updates = new Map();

  const authSecret = map.get("AUTH_SECRET")?.trim() ?? "";
  if (authSecret.length < 32) {
    updates.set("AUTH_SECRET", crypto.randomBytes(32).toString("base64"));
    console.log("Generated AUTH_SECRET in .env");
  }

  const db = map.get("DATABASE_URL")?.trim() ?? "";
  const looksLikePostgres = /^postgres(ql)?:\/\//i.test(db);
  const looksLikeHostSqlite = db.startsWith("file:./") || db.startsWith("file:prisma/");
  if (!db || looksLikePostgres || looksLikeHostSqlite) {
    updates.set("DATABASE_URL", STACK_DATABASE_URL);
    console.log("Set DATABASE_URL to SQLite file:/data/otterscale.db (app volume)");
  }

  const authUrl = map.get("AUTH_URL")?.trim() ?? "";
  if (!authUrl || /localhost:3000|127\.0\.0\.1:3000/.test(authUrl)) {
    updates.set("AUTH_URL", "https://console.localhost");
  }

  if (!map.get("HEADSCALE_PUBLIC_URL")?.trim()) {
    updates.set("HEADSCALE_PUBLIC_URL", "https://hs.localhost");
  }

  const internal = map.get("HEADSCALE_INTERNAL_URL")?.trim() ?? "";
  if (!internal || /localhost|127\.0\.0\.1/.test(internal)) {
    updates.set("HEADSCALE_INTERNAL_URL", "http://headscale:8080");
  }

  if (updates.size === 0) return content;
  return serializeEnvFile(content, updates);
}

function getEnvValue(content, key) {
  return parseEnvFile(content).get(key)?.trim() ?? "";
}

function setEnvValue(content, key, value) {
  return serializeEnvFile(content, new Map([[key, value]]));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHeadscale(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      headscaleExec(["users", "list", "--output", "json"]);
      return;
    } catch {
      /* not ready */
    }
    await delay(2000);
  }
  throw new Error("Headscale did not become ready (CLI could not reach the server)");
}

function headscaleExec(args, opts = {}) {
  // `docker compose exec` does not apply the image ENTRYPOINT; invoke the binary explicitly.
  return compose(["exec", "-T", "headscale", "/ko-app/headscale", ...args], {
    quiet: true,
    ...opts,
  }).trim();
}

function ensureHeadscaleUser() {
  let users = [];
  try {
    const raw = headscaleExec(["users", "list", "--output", "json"]);
    const parsed = raw ? JSON.parse(raw) : [];
    users = Array.isArray(parsed) ? parsed : (parsed?.users ?? []);
  } catch {
    users = [];
  }

  const names = new Set(
    users.map((u) => u.name ?? u.username ?? u.Name).filter(Boolean),
  );
  if (names.has(HEADSCALE_DEFAULT_USER)) return;

  console.log(`Creating Headscale user "${HEADSCALE_DEFAULT_USER}"...`);
  headscaleExec(["users", "create", HEADSCALE_DEFAULT_USER]);
}

/**
 * Same call the console uses (GET /api/v1/node), from the Docker network.
 * Headscale 0.23 rejects an unknown key with HTTP 500 + "Unauthorized".
 * The Bearer token is passed in env so Windows cmd.exe cannot split the header.
 */
function probeHeadscaleApiKey(apiKey) {
  const script =
    'fetch("http://headscale:8080/api/v1/node",{headers:{Authorization:"Bearer "+process.env.PROBE_KEY}}).then(async(r)=>{const t=await r.text();process.stdout.write(JSON.stringify({ok:r.ok,status:r.status,body:t.slice(0,200)}));}).catch((e)=>{process.stdout.write(JSON.stringify({ok:false,status:0,body:String(e.message||e)}));})';
  const res = spawnSync(
    "docker",
    [
      "compose",
      ...composeArgs(),
      "run",
      "--rm",
      "--no-deps",
      "-T",
      "-e",
      `PROBE_KEY=${apiKey}`,
      "--entrypoint",
      "node",
      "app",
      "-e",
      script,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      env: process.env,
    },
  );
  const raw = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  const parsed = parseProbePayload(raw);
  if (!parsed) {
    const detail =
      raw.slice(0, 200) || `probe exit ${res.status} (${res.error?.message ?? "no output"})`;
    throw new Error(`Headscale API key probe failed: ${detail}`);
  }
  return {
    ok: Boolean(parsed.ok),
    status: Number(parsed.status) || 0,
    body: String(parsed.body ?? ""),
  };
}

function describeProbe(probe) {
  const detail = probe.body?.trim().replace(/\s+/g, " ").slice(0, 120);
  return detail ? `${probe.status}: ${detail}` : String(probe.status);
}

/** Docker Compose may wrap the one-line JSON probe with logs. */
function parseProbePayload(text) {
  const start = text.indexOf('{"ok":');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function removeLegacyHop() {
  console.log("Removing leftover edge/probe containers if present...");
  spawnSync("docker", ["rm", "-f", "proxy", "edge", "probe", "apps-edge", "apps-probe", "apps-caddy"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  spawnSync("docker", ["volume", "rm", "otterscale_apps_edge_state"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
    windowsHide: true,
  });
}

function parsePreAuthKeyList(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return parsed.preAuthKeys ?? parsed.preauthkeys ?? parsed.keys ?? [];
  } catch {
    return [];
  }
}

function edgeAuthKeyIsValid(key) {
  if (!key) return false;
  let raw = "";
  try {
    raw = headscaleExec([
      "preauthkeys",
      "list",
      "--user",
      HEADSCALE_DEFAULT_USER,
      "--output",
      "json",
    ]);
  } catch {
    return true;
  }
  const rows = parsePreAuthKeyList(raw);
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const now = Date.now();
  return rows.some((row) => {
    const stored = String(row.key ?? row.Key ?? "").trim();
    if (!stored) return false;
    const same = stored === key || key.startsWith(stored) || stored.startsWith(key);
    if (!same) return false;
    if (row.expired === true) return false;
    const exp = row.expiration ?? row.Expiration;
    if (exp) {
      const t = Date.parse(exp);
      if (!Number.isNaN(t) && t < now) return false;
    }
    return true;
  });
}

function createEdgeAuthKey() {
  console.log("Creating reusable Headscale pre-auth key for tag:edge...");
  const raw = headscaleExec([
    "preauthkeys",
    "create",
    "--user",
    HEADSCALE_DEFAULT_USER,
    "--reusable",
    "--expiration",
    "8760h",
    "--tags",
    "tag:edge",
    "--output",
    "json",
  ]);
  let key = raw;
  try {
    const parsed = JSON.parse(raw);
    const row = parsed.preAuthKey ?? parsed.preauthkey ?? parsed;
    key = typeof row === "string" ? row : (row.key ?? parsed.key ?? "");
  } catch {
    const match = raw.match(/\b[\w-]{20,}\b/);
    if (match) key = match[0];
  }
  key = String(key).trim().replace(/^"|"$/g, "");
  if (key.length < 16) {
    throw new Error("Headscale did not return an edge pre-auth key");
  }
  return key;
}

function createHeadscaleApiKey() {
  console.log("Creating Headscale API key...");
  const raw = headscaleExec([
    "apikeys",
    "create",
    "--expiration",
    "8760h",
    "--output",
    "json",
  ]);
  let key = raw;
  try {
    const parsed = JSON.parse(raw);
    key =
      typeof parsed === "string"
        ? parsed
        : (parsed.apiKey ??
          parsed.api_key ??
          parsed.key ??
          parsed.id ??
          "");
  } catch {
    const match = raw.match(/hskey-[a-zA-Z0-9_-]+/);
    if (match) key = match[0];
  }
  key = String(key).trim().replace(/^"|"$/g, "");
  if (key.length < 16) {
    throw new Error(`Unexpected Headscale API key response: ${raw.slice(0, 200)}`);
  }
  return key;
}

async function main() {
  const noBuild = process.argv.includes("--no-build");

  let envContent = loadEnv();
  envContent = ensureEnvDefaults(envContent);
  fs.writeFileSync(envPath, envContent, "utf8");

  const composeEnv = {
    ...process.env,
    ...Object.fromEntries(parseEnvFile(envContent)),
  };

  if (!noBuild) {
    console.log("Building Docker images...");
    run("docker", ["compose", ...composeArgs(), "build"], { env: composeEnv });
  }

  removeLegacyHop();

  console.log("Starting Headscale and Caddy...");
  run("docker", ["compose", ...composeArgs(), "up", "-d", "--remove-orphans", "headscale", "caddy"], {
    env: composeEnv,
  });

  console.log("Waiting for Headscale...");
  await waitForHeadscale();

  ensureHeadscaleUser();

  envContent = fs.readFileSync(envPath, "utf8");
  let apiKey = getEnvValue(envContent, "HEADSCALE_API_KEY");
  const existing = apiKey ? probeHeadscaleApiKey(apiKey) : null;
  if (existing?.ok) {
    console.log("HEADSCALE_API_KEY is accepted by Headscale");
  } else {
    if (existing) {
      console.log(`HEADSCALE_API_KEY rejected (${describeProbe(existing)}); creating a new key`);
    } else {
      console.log("HEADSCALE_API_KEY is empty; creating a new key");
    }
    apiKey = createHeadscaleApiKey();
    const created = probeHeadscaleApiKey(apiKey);
    if (!created.ok) {
      throw new Error(
        `Newly created HEADSCALE_API_KEY was rejected by Headscale (${describeProbe(created)})`,
      );
    }
    envContent = setEnvValue(envContent, "HEADSCALE_API_KEY", apiKey);
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("Wrote HEADSCALE_API_KEY to .env");
  }

  envContent = fs.readFileSync(envPath, "utf8");
  let edgeKey = getEnvValue(envContent, "APPS_EDGE_AUTHKEY");
  if (!edgeKey || !edgeAuthKeyIsValid(edgeKey)) {
    if (edgeKey) {
      console.log("APPS_EDGE_AUTHKEY is missing or expired in Headscale; creating a new key");
    }
    edgeKey = createEdgeAuthKey();
    envContent = setEnvValue(envContent, "APPS_EDGE_AUTHKEY", edgeKey);
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("Wrote APPS_EDGE_AUTHKEY to .env");
  }

  console.log("Starting Otterscale app, public Caddy, and apps proxy (migrations run on container start)...");
  run(
    "docker",
    [
      "compose",
      ...composeArgs(),
      "up",
      "-d",
      "--remove-orphans",
      "app",
      "caddy",
      "proxy",
      "--force-recreate",
    ],
    {
      env: { ...composeEnv, HEADSCALE_API_KEY: apiKey, APPS_EDGE_AUTHKEY: edgeKey },
    },
  );

  console.log("\nStack is up:");
  console.log("  Console:   https://console.localhost  (first visit: /setup or sign-in)");
  console.log("  Headscale: https://hs.localhost");
  console.log("  Apps:      https://{subdomain}.apps.localhost");
  console.log("  SQLite:    /data/otterscale.db in the app volume");
  console.log("\nAdd to hosts if needed:  127.0.0.1 console.localhost hs.localhost");
  console.log("Trust Caddy's local CA (Tailscale requires it):");
  console.log("  docker exec caddy cat /data/caddy/pki/authorities/local/root.crt");
  console.log("\nTailscale clients on this PC: tailscale up --login-server=http://127.0.0.1:8080 --auth-key=<from Machines UI>");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
