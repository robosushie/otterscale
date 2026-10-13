#!/usr/bin/env node
/**
 * Multi-container stack (project otterscale).
 * Default: delete this project's volumes, then start Headscale → init → app + edge.
 * --keep-data: reuse volumes. Bootstrap reuses secrets on the volume.
 * --no-build: skip image build.
 *
 * HEADSCALE_API_KEY and APPS_EDGE_AUTHKEY are minted into the secrets volume.
 * They are not written to .env. AUTH_SECRET stays in .env.
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
const composeFile = path.join(repoRoot, "deployment/docker-compose.yml");
const otherComposeFile = path.join(repoRoot, "deployment/docker-compose.standalone.yml");

const STACK_DATABASE_URL = "file:/data/otterscale.db";
const LOCAL_LOGIN_SERVER = "http://127.0.0.1:8080";
const HEADSCALE_ENV_KEYS = ["HEADSCALE_API_KEY", "APPS_EDGE_AUTHKEY"];

function composeArgs() {
  return ["-p", "otterscale", "-f", composeFile, "--env-file", envPath];
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: opts.quiet ? "pipe" : "inherit",
    encoding: "utf8",
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

function stripHeadscaleKeys(content) {
  let removed = false;
  const lines = content.split(/\r?\n/).filter((line) => {
    const eq = line.indexOf("=");
    if (eq === -1) return true;
    const key = line.slice(0, eq).trim();
    if (HEADSCALE_ENV_KEYS.includes(key)) {
      removed = true;
      return false;
    }
    return true;
  });
  if (removed) {
    console.log(
      "Removed HEADSCALE_API_KEY and APPS_EDGE_AUTHKEY from .env (secrets volume owns them)",
    );
  }
  return lines.join("\n").replace(/\n?$/, "\n");
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
  const looksLikeHostSqlite = db.startsWith("file:./") || db.startsWith("file:prisma/");
  if (looksLikeHostSqlite) {
    updates.set("DATABASE_URL", STACK_DATABASE_URL);
    console.log("Set DATABASE_URL to SQLite file:/data/otterscale.db (core volume)");
  }

  const authUrl = map.get("AUTH_URL")?.trim() ?? "";
  if (!authUrl || /localhost:3000|127\.0\.0\.1:3000/.test(authUrl)) {
    updates.set("AUTH_URL", "https://console.localhost");
  }

  if (!map.get("HEADSCALE_PUBLIC_URL")?.trim()) {
    updates.set("HEADSCALE_PUBLIC_URL", "https://hs.localhost");
  }

  if (updates.size === 0) return content;
  return serializeEnvFile(content, updates);
}

function getEnvValue(content, key) {
  return parseEnvFile(content).get(key)?.trim() ?? "";
}

function loginServerUrl(domain) {
  const raw = (domain ?? "").trim();
  if (!raw) return LOCAL_LOGIN_SERVER;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).origin;
    } catch {
      return LOCAL_LOGIN_SERVER;
    }
  }
  return `https://${raw.replace(/\/+$/, "")}`;
}

function composeEnvFrom(content) {
  const map = parseEnvFile(content);
  const env = { ...process.env, ...Object.fromEntries(map) };
  delete env.PORT;
  for (const key of HEADSCALE_ENV_KEYS) delete env[key];
  return env;
}

function stopOther(env) {
  const res = spawnSync(
    "docker",
    ["compose", "-p", "otterscale-standalone", "-f", otherComposeFile, "stop"],
    {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true,
      env,
    },
  );
  if (res.status === 0) {
    console.log("Stopped standalone (its volumes were kept).");
  }
}

function main() {
  const keepData = process.argv.includes("--keep-data");
  const noBuild = process.argv.includes("--no-build");

  let envContent = stripHeadscaleKeys(ensureEnvDefaults(loadEnv()));
  fs.writeFileSync(envPath, envContent, "utf8");

  const composeEnv = composeEnvFrom(envContent);
  stopOther(composeEnv);

  if (!keepData) {
    console.log("Removing stack containers and volumes...");
    run("docker", ["compose", ...composeArgs(), "down", "-v", "--remove-orphans"], {
      env: composeEnv,
    });
  } else {
    console.log("Keeping stack volumes (--keep-data).");
  }

  if (!noBuild) {
    console.log("Building Docker images...");
    run("docker", ["compose", ...composeArgs(), "build"], { env: composeEnv });
  }

  const up = ["compose", ...composeArgs(), "up", "-d", "--remove-orphans"];
  if (keepData) up.push("--force-recreate");
  console.log("Starting Headscale, init, app, and edge...");
  run("docker", up, { env: composeEnv });

  const loginServer = loginServerUrl(getEnvValue(envContent, "OTTERSCALE_DOMAIN"));

  console.log("\nStack is up:");
  console.log("  Console:   https://console.localhost  (first visit: /setup or sign-in)");
  console.log(`  Headscale: ${loginServer}  (Tailscale login-server)`);
  console.log("  Apps:      https://{subdomain}.apps.localhost");
  console.log("  SQLite:    /data/otterscale.db in the app volume");
  console.log("  Keys:      otterscale_secrets volume (not .env)");
  console.log("\nJoin a device from Machines:");
  console.log("  tailscale logout");
  console.log(`  tailscale up --login-server=${loginServer} --auth-key=<from Machines UI>`);
}

try {
  main();
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
