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

export function formatHeadscaleError(err: unknown): string {
  if (err instanceof HeadscaleError) {
    const detail = err.body?.trim();
    return detail ? `${err.message} (${err.status}: ${detail})` : `${err.message} (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return "Failed to reach Headscale";
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
  clientVersion?: string;
  addresses?: string[];
};

type RawNode = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function mapHeadscaleNode(raw: RawNode): HeadscaleNode {
  const hostInfo = asRecord(raw.hostInfo ?? raw.host_info);
  const userRaw = asRecord(raw.user);
  const addresses = asStringList(raw.ipAddresses ?? raw.ip_addresses ?? raw.addresses);
  const lastSeen = raw.lastSeen ?? raw.last_seen;
  const clientVersion =
    (typeof raw.clientVersion === "string" && raw.clientVersion) ||
    (typeof raw.forceTags === "string" && raw.forceTags) ||
    (typeof hostInfo.ipn_version === "string" && hostInfo.ipn_version) ||
    (typeof hostInfo.ipnVersion === "string" && hostInfo.ipnVersion) ||
    undefined;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.givenName ?? raw.given_name ?? raw.name ?? ""),
    hostname: String(hostInfo.hostname ?? raw.name ?? ""),
    user: userRaw.name || userRaw.id ? { name: String(userRaw.name ?? ""), id: String(userRaw.id ?? "") } : undefined,
    tags: asStringList(raw.forcedTags ?? raw.forced_tags ?? raw.tags),
    online: Boolean(raw.online),
    lastSeen: typeof lastSeen === "string" ? lastSeen : undefined,
    os: typeof hostInfo.os === "string" ? hostInfo.os : undefined,
    clientVersion,
    addresses,
  };
}

export async function listNodes(): Promise<HeadscaleNode[]> {
  const res = await hsFetch("/api/v1/node");
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to list nodes", res.status, body);
  }
  const data = (await res.json()) as { nodes?: RawNode[] };
  return (data.nodes ?? []).map((node) => mapHeadscaleNode(asRecord(node)));
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

const PREAUTH_TTL_MS = 24 * 60 * 60 * 1000;

/** Headscale 0.23 treats a missing/zero expiration as already expired. */
export function preauthKeyExpiration(from = new Date()): string {
  return new Date(from.getTime() + PREAUTH_TTL_MS).toISOString();
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
      expiration: options.expiration
        ? options.expiration.toISOString()
        : preauthKeyExpiration(),
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

export async function renameNode(nodeId: string, name: string): Promise<void> {
  const encoded = encodeURIComponent(name);
  const res = await hsFetch(`/api/v1/node/${encodeURIComponent(nodeId)}/rename/${encoded}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to rename node", res.status, body);
  }
}

export async function deleteNode(nodeId: string): Promise<void> {
  const res = await hsFetch(`/api/v1/node/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to delete node", res.status, body);
  }
}

export async function setNodeTags(nodeId: string, tags: string[]): Promise<void> {
  const res = await hsFetch(`/api/v1/node/${encodeURIComponent(nodeId)}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to set node tags", res.status, body);
  }
}

export type HeadscalePreAuthKey = {
  id: string;
  key: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
  used?: boolean;
  aclTags?: string[];
};

export async function expirePreAuthKey(key: string, user = "tagged-devices"): Promise<void> {
  const res = await hsFetch("/api/v1/preauthkey/expire", {
    method: "POST",
    body: JSON.stringify({ user, key }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to expire auth key", res.status, body);
  }
}

export async function listPreAuthKeys(user = "tagged-devices"): Promise<HeadscalePreAuthKey[]> {
  const res = await hsFetch(`/api/v1/preauthkey?user=${encodeURIComponent(user)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new HeadscaleError("Failed to list auth keys", res.status, body);
  }
  const data = (await res.json()) as { preAuthKeys?: RawNode[]; pre_auth_keys?: RawNode[] };
  const rows = data.preAuthKeys ?? data.pre_auth_keys ?? [];
  return rows.map((raw) => {
    const row = asRecord(raw);
    return {
      id: String(row.id ?? ""),
      key: String(row.key ?? ""),
      reusable: Boolean(row.reusable),
      ephemeral: Boolean(row.ephemeral),
      expiration: typeof row.expiration === "string" ? row.expiration : undefined,
      used: Boolean(row.used),
      aclTags: asStringList(row.aclTags ?? row.acl_tags),
    };
  });
}

export function isHeadscaleConfigured(): boolean {
  return getConfig() !== null;
}
