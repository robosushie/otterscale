const LOCAL_LOGIN_SERVER = "http://127.0.0.1:8080";

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

/** Login-server for official Tailscale clients. Local default skips TLS. */
export function getLoginServerUrl(domain = process.env.OTTERSCALE_DOMAIN): string {
  const raw = domain?.trim();
  if (!raw) return LOCAL_LOGIN_SERVER;
  if (/^https?:\/\//i.test(raw)) {
    return originOf(raw) ?? LOCAL_LOGIN_SERVER;
  }
  return `https://${raw.replace(/\/+$/, "")}`;
}

export function tailscaleUpCommand(authKey: string, loginServer = getLoginServerUrl()): string {
  return `tailscale logout\ntailscale up --login-server=${loginServer} --auth-key=${authKey}`;
}
