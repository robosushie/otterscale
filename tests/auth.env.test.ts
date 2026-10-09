import { describe, it, expect } from "vitest";
import { parseServerEnvForTest } from "@/lib/env";

const BASE = {
  DATABASE_URL: "file:./prisma/dev.db",
  AUTH_SECRET: "01234567890123456789012345678901",
};

describe("parseServerEnvForTest", () => {
  it("boots with local auth only when OIDC vars are missing", () => {
    const env = parseServerEnvForTest({
      ...BASE,
      AUTH_OIDC_ISSUER: undefined,
      AUTH_OIDC_CLIENT_ID: undefined,
      AUTH_OIDC_CLIENT_SECRET: undefined,
    });
    expect(env.AUTH_OIDC_ISSUER).toBeUndefined();
    expect(env.DATABASE_URL).toContain("file:");
  });

  it("accepts partial OIDC config without failing boot", () => {
    const env = parseServerEnvForTest({
      ...BASE,
      AUTH_OIDC_ISSUER: "https://idp.example.com",
    });
    expect(env.AUTH_OIDC_ISSUER).toBe("https://idp.example.com");
    expect(env.AUTH_OIDC_CLIENT_ID).toBeUndefined();
  });

  it("accepts full OIDC credentials", () => {
    const env = parseServerEnvForTest({
      ...BASE,
      AUTH_OIDC_ISSUER: "https://idp.example.com",
      AUTH_OIDC_CLIENT_ID: "client",
      AUTH_OIDC_CLIENT_SECRET: "secret",
    });
    expect(env.AUTH_OIDC_ISSUER).toBe("https://idp.example.com");
    expect(env.AUTH_OIDC_CLIENT_ID).toBe("client");
  });

  it("still requires AUTH_SECRET", () => {
    expect(() =>
      parseServerEnvForTest({
        DATABASE_URL: BASE.DATABASE_URL,
        AUTH_SECRET: "short",
      }),
    ).toThrow(/AUTH_SECRET/);
  });
});
