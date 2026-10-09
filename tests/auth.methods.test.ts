import { afterEach, describe, expect, it } from "vitest";
import { getAuthMethodsPublic, isGoogleOidcIssuer, isOidcEnabled } from "@/lib/auth/methods";

const KEYS = ["AUTH_OIDC_ISSUER", "AUTH_OIDC_CLIENT_ID", "AUTH_OIDC_CLIENT_SECRET"] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("auth methods", () => {
  it("enables OIDC only when all three credentials exist", () => {
    expect(isOidcEnabled()).toBe(false);
    process.env.AUTH_OIDC_ISSUER = "https://idp.example.com";
    process.env.AUTH_OIDC_CLIENT_ID = "id";
    expect(isOidcEnabled()).toBe(false);
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    expect(isOidcEnabled()).toBe(true);
    expect(getAuthMethodsPublic()).toEqual({
      oidcEnabled: true,
      googleOidcEnabled: false,
      localAuthEnabled: true,
    });
  });

  it("marks Google when the issuer is accounts.google.com", () => {
    process.env.AUTH_OIDC_ISSUER = "https://accounts.google.com";
    process.env.AUTH_OIDC_CLIENT_ID = "id";
    process.env.AUTH_OIDC_CLIENT_SECRET = "secret";
    expect(isGoogleOidcIssuer()).toBe(true);
    expect(getAuthMethodsPublic().googleOidcEnabled).toBe(true);
  });
});
