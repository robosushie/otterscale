#!/usr/bin/env node
/**
 * One-command stack deploy: Postgres (bundled) + Headscale + Otterscale app.
 * - Ensures .env (AUTH_SECRET, DATABASE_URL for bundled Postgres)
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
    "-f",
    path.join(repoRoot, "deploy/docker-compose.stack.yml"),
    "--env-file",
    envPath,
  ];
}

const STACK_DATABASE_URL =
  "postgresql://otterscale:otterscale@postgres:5432/otterscale";
const HEADSCALE_DEFAULT_USER = "tagged-devices";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: opts.quiet ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
  });
  if (res.status !== 0) {
    const detail = res.stderr?.trim() || res.stdout?.trim();
    throw new Error(
      `${cmd} ${args.join(" ")} failed (exit ${res.status})${detail ? `: ${detail}` : ""}`,
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
  const looksLikeHostPostgres =
    db &&
    /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(db) &&
    !db.includes("@postgres:");
  if (!db || looksLikeHostPostgres) {
    updates.set("DATABASE_URL", STACK_DATABASE_URL);
    console.log(
      looksLikeHostPostgres
        ? "Pointed DATABASE_URL at bundled Postgres (host localhost URLs do not work inside the app container)"
        : "Set DATABASE_URL to bundled Postgres (deploy/docker-compose.stack.yml)",
    );
  }

  if (!map.get("AUTH_URL")?.trim()) {
    updates.set("AUTH_URL", "http://localhost:3000");
  }

  if (!map.get("HEADSCALE_INTERNAL_URL")?.trim()) {
    updates.set("HEADSCALE_INTERNAL_URL", "http://localhost:8080");
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

  console.log("Starting Postgres and Headscale...");
  run(
    "docker",
    ["compose", ...composeArgs(), "up", "-d", "postgres", "headscale"],
    { env: composeEnv },
  );

  console.log("Waiting for Headscale...");
  await waitForHeadscale();

  ensureHeadscaleUser();

  envContent = fs.readFileSync(envPath, "utf8");
  let apiKey = getEnvValue(envContent, "HEADSCALE_API_KEY");
  if (!apiKey) {
    apiKey = createHeadscaleApiKey();
    envContent = setEnvValue(envContent, "HEADSCALE_API_KEY", apiKey);
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("Wrote HEADSCALE_API_KEY to .env");
  } else {
    console.log("HEADSCALE_API_KEY already set; skipping API key creation");
  }

  console.log("Starting Otterscale app (migrations run on container start)...");
  run("docker", ["compose", ...composeArgs(), "up", "-d", "app", "--force-recreate"], {
    env: { ...composeEnv, HEADSCALE_API_KEY: apiKey },
  });

  console.log("\nStack is up:");
  console.log("  App:       http://localhost:3000  (first visit: /setup or sign-in)");
  console.log("  Headscale: http://localhost:8080");
  console.log("  Postgres:  localhost:5432 (bundled; not published by default — use docker exec if needed)");
  console.log("\nTailscale clients: tailscale up --login-server=http://<host>:8080 --auth-key=<from Network UI>");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
