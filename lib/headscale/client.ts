/**
 * Only module that calls Headscale HTTP APIs.
 */

export class HeadscaleError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "HeadscaleError";
  }
}

type HeadscaleConfig = {
  baseUrl: string;
  apiKey: string;
};

function getConfig(): HeadscaleConfig | null {
  const baseUrl = process.env.HEADSCALE_INTERNAL_URL;
  const apiKey = process.env.HEADSCALE_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function hsFetch(path: string, init?: RequestInit): Promise<Response> {
  const cfg = getConfig();
  if (!cfg) {
    throw new HeadscaleError("Headscale is not configured (HEADSCALE_INTERNAL_URL / HEADSCALE_API_KEY)", 503);
  }
  const url = `${cfg.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return res;
}

export type HeadscaleNode = {
  id: string;
  name: string;
  hostname: string;
  user?: { name?: string; id?: string };
  tags?: string[];
  online?: boolean;
  lastSeen?: string;
  os?: string;
};

export async function listNodes(): Promise<HeadscaleNode[]> {
  const res = await hsFetch("/api/v1/node");
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to list nodes", res.status, body);
  }
  const data = (await res.json()) as { nodes?: HeadscaleNode[] };
  return data.nodes ?? [];
}

export async function getPolicy(): Promise<string> {
  const res = await hsFetch("/api/v1/policy");
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to get policy", res.status, body);
  }
  const data = (await res.json()) as { policy?: string; data?: { policy?: string } };
  return data.policy ?? data.data?.policy ?? "";
}

export async function putPolicy(hujson: string): Promise<void> {
  const res = await hsFetch("/api/v1/policy", {
    method: "PUT",
    body: JSON.stringify({ policy: hujson }),
  });
  if (!res.ok) {
    const res2 = await hsFetch("/api/v1/policy", {
      method: "POST",
      body: JSON.stringify({ policy: hujson }),
    });
    if (!res2.ok) {
      const body = await res2.text();
      throw new HeadscaleError("Failed to apply policy", res2.status, body);
    }
  }
}

export type PreAuthKeyOptions = {
  user?: string;
  reusable?: boolean;
  ephemeral?: boolean;
  expiration?: Date;
  aclTags?: string[];
};

export async function createPreAuthKey(
  options: PreAuthKeyOptions,
): Promise<{ key: string }> {
  const res = await hsFetch("/api/v1/preauthkey", {
    method: "POST",
    body: JSON.stringify({
      user: options.user ?? "tagged-devices",
      reusable: options.reusable ?? false,
      ephemeral: options.ephemeral ?? false,
      expiration: options.expiration?.toISOString(),
      aclTags: options.aclTags ?? [],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to create preauth key", res.status, body);
  }
  const data = (await res.json()) as { preAuthKey?: { key?: string }; key?: string };
  const key = data.preAuthKey?.key ?? data.key;
  if (!key) throw new HeadscaleError("No key in response", 500);
  return { key };
}

export function isHeadscaleConfigured(): boolean {
  return getConfig() !== null;
}
