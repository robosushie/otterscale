const HEADSCALE_CLIENT_PORT = "8080";

function originOf(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return null;
  }
}

/** Public login-server for official Tailscale clients. */
export function getLoginServerUrl(
  authUrl = process.env.AUTH_URL,
  publicUrl = process.env.HEADSCALE_PUBLIC_URL,
): string {
  const advertised = publicUrl?.trim();
  if (advertised) {
    const origin = originOf(advertised);
    if (origin) return origin;
  }

  const raw = authUrl?.trim();
  if (!raw) return `http://localhost:${HEADSCALE_CLIENT_PORT}`;
  try {
    const url = new URL(raw);
    url.port = HEADSCALE_CLIENT_PORT;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return `http://localhost:${HEADSCALE_CLIENT_PORT}`;
  }
}

export function tailscaleUpCommand(authKey: string, loginServer = getLoginServerUrl()): string {
  return `tailscale up --login-server=${loginServer} --auth-key=${authKey}`;
}
