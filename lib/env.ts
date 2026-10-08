import { z } from "zod";

function envBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

function emptyToUndef(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  AUTH_OIDC_ENABLED: z.boolean(),
  AUTH_OIDC_ISSUER: z.string().url().optional(),
  AUTH_OIDC_CLIENT_ID: z.string().min(1).optional(),
  AUTH_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_LOCAL_AUTH_ENABLED: z.boolean(),
  AUTH_SETUP_TOKEN: z.string().min(1).optional(),
  HEADSCALE_INTERNAL_URL: z.string().url().optional(),
  HEADSCALE_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof baseSchema>;

let cached: ServerEnv | null = null;

function parseRawEnv(): ServerEnv {
  const oidcEnabled = envBool(process.env.AUTH_OIDC_ENABLED, true);
  const localEnabled = envBool(process.env.AUTH_LOCAL_AUTH_ENABLED, true);

  const raw = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: emptyToUndef(process.env.AUTH_URL),
    AUTH_OIDC_ENABLED: oidcEnabled,
    AUTH_OIDC_ISSUER: emptyToUndef(process.env.AUTH_OIDC_ISSUER),
    AUTH_OIDC_CLIENT_ID: emptyToUndef(process.env.AUTH_OIDC_CLIENT_ID),
    AUTH_OIDC_CLIENT_SECRET: emptyToUndef(process.env.AUTH_OIDC_CLIENT_SECRET),
    AUTH_LOCAL_AUTH_ENABLED: localEnabled,
    AUTH_SETUP_TOKEN: emptyToUndef(process.env.AUTH_SETUP_TOKEN),
    HEADSCALE_INTERNAL_URL: emptyToUndef(process.env.HEADSCALE_INTERNAL_URL),
    HEADSCALE_API_KEY: emptyToUndef(process.env.HEADSCALE_API_KEY),
  };

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. Copy .env.example and configure auth and DATABASE_URL.`,
    );
  }

  const env = parsed.data;

  if (!env.AUTH_OIDC_ENABLED && !env.AUTH_LOCAL_AUTH_ENABLED) {
    throw new Error(
      "At least one of AUTH_OIDC_ENABLED or AUTH_LOCAL_AUTH_ENABLED must be true.",
    );
  }

  if (env.AUTH_OIDC_ENABLED) {
    if (!env.AUTH_OIDC_ISSUER || !env.AUTH_OIDC_CLIENT_ID || !env.AUTH_OIDC_CLIENT_SECRET) {
      throw new Error(
        "AUTH_OIDC_ISSUER, AUTH_OIDC_CLIENT_ID, and AUTH_OIDC_CLIENT_SECRET are required when AUTH_OIDC_ENABLED is true.",
      );
    }
  }

  return env;
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
