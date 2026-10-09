function emptyToUndef(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

export function hasOidcCredentials(): boolean {
  return Boolean(
    emptyToUndef(process.env.AUTH_OIDC_ISSUER) &&
      emptyToUndef(process.env.AUTH_OIDC_CLIENT_ID) &&
      emptyToUndef(process.env.AUTH_OIDC_CLIENT_SECRET),
  );
}

export function isGoogleOidcIssuer(issuer = process.env.AUTH_OIDC_ISSUER): boolean {
  if (!issuer) return false;
  try {
    const host = new URL(issuer).hostname;
    return host === "accounts.google.com" || host.endsWith(".google.com");
  } catch {
    return issuer.includes("accounts.google.com");
  }
}

/** Safe auth method flags for UI (no secrets). Local auth is always on. */
export function getAuthMethodsPublic() {
  const oidcEnabled = hasOidcCredentials();
  return {
    oidcEnabled,
    googleOidcEnabled: oidcEnabled && isGoogleOidcIssuer(),
    localAuthEnabled: true,
  };
}

export function isOidcEnabled(): boolean {
  return hasOidcCredentials();
}

export function isLocalAuthEnabled(): boolean {
  return true;
}

export function jwtSessionsEnabled(): boolean {
  return true;
}
