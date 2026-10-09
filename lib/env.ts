import { z } from "zod";

function emptyToUndef(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  AUTH_OIDC_ISSUER: z.string().url().optional(),
  AUTH_OIDC_CLIENT_ID: z.string().min(1).optional(),
  AUTH_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_SETUP_TOKEN: z.string().min(1).optional(),
  HEADSCALE_INTERNAL_URL: z.string().url().optional(),
  HEADSCALE_PUBLIC_URL: z.string().url().optional(),
  HEADSCALE_API_KEY: z.string().optional(),
  APPS_BASE_DOMAIN: z.string().min(1).optional(),
  APPS_ROUTES_PATH: z.string().min(1).optional(),
  APPS_PROBE_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof baseSchema>;

let cached: ServerEnv | null = null;

function parseRawEnv(): ServerEnv {
  const raw = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: emptyToUndef(process.env.AUTH_URL),
    AUTH_OIDC_ISSUER: emptyToUndef(process.env.AUTH_OIDC_ISSUER),
    AUTH_OIDC_CLIENT_ID: emptyToUndef(process.env.AUTH_OIDC_CLIENT_ID),
    AUTH_OIDC_CLIENT_SECRET: emptyToUndef(process.env.AUTH_OIDC_CLIENT_SECRET),
    AUTH_SETUP_TOKEN: emptyToUndef(process.env.AUTH_SETUP_TOKEN),
    HEADSCALE_INTERNAL_URL: emptyToUndef(process.env.HEADSCALE_INTERNAL_URL),
    HEADSCALE_PUBLIC_URL: emptyToUndef(process.env.HEADSCALE_PUBLIC_URL),
    HEADSCALE_API_KEY: emptyToUndef(process.env.HEADSCALE_API_KEY),
    APPS_BASE_DOMAIN: emptyToUndef(process.env.APPS_BASE_DOMAIN),
    APPS_ROUTES_PATH: emptyToUndef(process.env.APPS_ROUTES_PATH),
    APPS_PROBE_URL: emptyToUndef(process.env.APPS_PROBE_URL),
  };

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. Copy .env.example and configure AUTH_SECRET and DATABASE_URL.`,
    );
  }

  return parsed.data;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = parseRawEnv();
  return cached;
}

export function requireEnv(name: keyof ServerEnv): string {
  const env = getServerEnv();
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return String(value);
}

export function resetServerEnvCache(): void {
  cached = null;
}

/** Parse env without caching; for tests. */
export function parseServerEnvForTest(overrides: Record<string, string | undefined>): ServerEnv {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const val = overrides[key];
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  resetServerEnvCache();
  try {
    return parseRawEnv();
  } finally {
    for (const key of Object.keys(overrides)) {
      const val = saved[key];
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    resetServerEnvCache();
  }
}
