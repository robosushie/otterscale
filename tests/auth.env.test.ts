import { describe, it, expect } from "vitest";
import { parseServerEnvForTest } from "@/lib/env";

const BASE = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "01234567890123456789012345678901",
};

describe("parseServerEnvForTest", () => {
  it("allows OIDC off and local on", () => {
    const env = parseServerEnvForTest({
      ...BASE,
      AUTH_OIDC_ENABLED: "false",
      AUTH_LOCAL_AUTH_ENABLED: "true",
    });
    expect(env.AUTH_OIDC_ENABLED).toBe(false);
    expect(env.AUTH_LOCAL_AUTH_ENABLED).toBe(true);
  });

  it("requires OIDC credentials when OIDC enabled", () => {
    expect(() =>
      parseServerEnvForTest({
        ...BASE,
        AUTH_OIDC_ENABLED: "true",
        AUTH_LOCAL_AUTH_ENABLED: "false",
      }),
    ).toThrow(/AUTH_OIDC_ISSUER/);
  });

  it("rejects both auth methods disabled", () => {
    expect(() =>
      parseServerEnvForTest({
        ...BASE,
        AUTH_OIDC_ENABLED: "false",
        AUTH_LOCAL_AUTH_ENABLED: "false",
      }),
    ).toThrow(/At least one/);
  });

  it("accepts full OIDC config when OIDC only", () => {
    const env = parseServerEnvForTest({
      ...BASE,
      AUTH_OIDC_ENABLED: "true",
      AUTH_LOCAL_AUTH_ENABLED: "false",
      AUTH_OIDC_ISSUER: "https://idp.example.com",
      AUTH_OIDC_CLIENT_ID: "client",
      AUTH_OIDC_CLIENT_SECRET: "secret",
    });
    expect(env.AUTH_OIDC_ISSUER).toBe("https://idp.example.com");
  });
});
