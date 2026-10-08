#!/usr/bin/env node
/**
 * Create and apply a Prisma migration from schema changes.
 * Usage: pnpm db:make -- <migration_name>
 * Example: pnpm db:make -- add_user_invites
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const nameIdx = args.indexOf("--name");
const name =
  nameIdx >= 0 && args[nameIdx + 1]
    ? args[nameIdx + 1]
    : args.find((a) => !a.startsWith("-"));

if (!name || name.startsWith("-")) {
  console.error("Usage: pnpm db:make -- <migration_name>");
  console.error("   or: pnpm db:make -- --name <migration_name>");
  process.exit(1);
}

const slug = name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
if (!slug) {
  console.error("Migration name must contain letters, numbers, or underscores.");
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "migrate", "dev", "--name", slug],
  { stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
