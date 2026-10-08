function envBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

/** Safe auth method flags for UI (no secrets). */
export function getAuthMethodsPublic() {
  return {
    oidcEnabled: envBool(process.env.AUTH_OIDC_ENABLED, true),
    localAuthEnabled: envBool(process.env.AUTH_LOCAL_AUTH_ENABLED, true),
  };
}

export function isOidcEnabled(): boolean {
  return envBool(process.env.AUTH_OIDC_ENABLED, true);
}

export function isLocalAuthEnabled(): boolean {
  return envBool(process.env.AUTH_LOCAL_AUTH_ENABLED, true);
}

export function useJwtSessions(): boolean {
  return isLocalAuthEnabled();
}
