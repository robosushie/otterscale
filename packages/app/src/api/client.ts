export type Capabilities = {
  userId: string;
  email: string;
  name: string | null;
  platformRoles: string[];
  tenantRole: string | null;
  capabilities: string[];
  isOwner: boolean;
  isPlatformAdmin: boolean;
  workspaceIds: string[];
};

export type MachineRow = {
  machineId: string;
  name: string;
  addresses: string;
  lastSeen: string;
  online: boolean;
  workspaceNames: string[];
  tagNames: string[];
  selectedWorkspaceIds: string[];
  selectedTagIds: string[];
  addedBy: string;
  createdById: string;
};

export type MachinesTable = {
  rows: MachineRow[];
  unassigned: number;
  headscaleError: string | null;
  configured: boolean;
  canManage: boolean;
  workspaces: { id: string; name: string }[];
  tags: { id: string; name: string; aclTag: string }[];
  loginServer: string;
};

export type WorkspaceRow = { id: string; name: string; members: string[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.error || response.statusText) as Error & { totpRequired?: boolean; status?: number };
    error.totpRequired = Boolean(data.totpRequired);
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export const api = {
  session: () =>
    request<{ user: Capabilities | null; methods: { hasOwner: boolean; oidc: boolean; google?: boolean } }>("/api/auth/session"),
  lookupInvite: (code: string) =>
    request<{ email: string; username: string }>("/api/auth/invite/lookup", { method: "POST", body: JSON.stringify({ code }) }),
  setup: (body: Record<string, string>) => request("/api/auth/setup", { method: "POST", body: JSON.stringify(body) }),
  totp: (username: string) => request<{ secret: string; uri: string }>("/api/auth/totp", { method: "POST", body: JSON.stringify({ username }) }),
  signin: (body: Record<string, string>) => request("/api/auth/signin", { method: "POST", body: JSON.stringify(body) }),
  redeem: (body: Record<string, string>) => request("/api/auth/redeem", { method: "POST", body: JSON.stringify(body) }),
  signout: () => request("/api/auth/signout", { method: "POST" }),
  machines: () => request<MachinesTable>("/api/machines"),
  keys: () => request<{ id: string; key: string; reusable: boolean; aclTags: string[]; expiration: string }[]>("/api/machines/keys"),
  createKey: (body: { workspaceIds: string[]; tagIds: string[]; expiry: string }) =>
    request<{ key: string; loginServer: string }>("/api/machines/keys", { method: "POST", body: JSON.stringify(body) }),
  expireKey: (key: string) => request("/api/machines/keys/expire", { method: "POST", body: JSON.stringify({ key }) }),
  updateMachine: (id: string, body: { name: string; workspaceIds: string[]; tagIds: string[] }) =>
    request(`/api/machines/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMachine: (id: string) => request(`/api/machines/${id}`, { method: "DELETE" }),
  workspaces: () => request<WorkspaceRow[]>("/api/workspaces"),
  createWorkspace: (name: string) => request("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
  addMember: (id: string, email: string, role: string) =>
    request(`/api/workspaces/${id}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  tags: () => request<{ id: string; name: string; aclTag: string }[]>("/api/tags"),
  createTag: (name: string) => request("/api/tags", { method: "POST", body: JSON.stringify({ name }) }),
  rules: () => request<{ id: string; group: string; tag: string; ports: string }[]>("/api/access-rules"),
  createRule: (body: { groupId: string; tagId: string; ports: string }) =>
    request("/api/access-rules", { method: "POST", body: JSON.stringify(body) }),
  policies: () => request<{ id: string; status: string; contentHash: string; hujson: string; createdAt: string }[]>("/api/policies"),
  applyPolicy: () => request<{ hujson: string }>("/api/policies/apply", { method: "POST", body: "{}" }),
  apps: () => request<{ id: string; machine: string; machineId: string; port: number; subdomain: string; status: string; lastError: string; addedBy: string; createdById: string; workspaces: string[] }[]>("/api/apps"),
  publishApp: (body: { machineId: string; port: number; subdomain: string }) =>
    request("/api/apps", { method: "POST", body: JSON.stringify(body) }),
  deleteApp: (id: string) => request(`/api/apps/${id}`, { method: "DELETE" }),
  users: () =>
    request<{ id: string; username: string; email: string; name: string; role: string; roleKey?: string; joined?: string; workspaceIds?: string[]; workspaces: string[] }[]>("/api/users"),
  updateUser: (id: string, body: { role: string; workspaceIds: string[] }) =>
    request(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request(`/api/users/${id}`, { method: "DELETE" }),
  createInvite: (body: { email: string; username: string; role: string; workspaceIds: string[] }) =>
    request<{ id?: string; code: string; email: string; acceptPath: string; expiresAt?: string }>("/api/users/invites", { method: "POST", body: JSON.stringify(body) }),
  invites: () =>
    request<{ id: string; email: string; username: string; tenantRole: string; platformRole: string | null; expiresAt: string; workspaceIds?: string[]; workspaces?: string[] }[]>("/api/users/invites"),
  revokeInvite: (id: string) => request(`/api/users/invites/${id}/revoke`, { method: "POST", body: "{}" }),
  audit: (category: "SYSTEM" | "NETWORK") => request<{ id: string; action: string; actor: string; createdAt: string }[]>(`/api/audit?category=${category}`),
  settings: () => request<{ name: string; appsBaseDomain: string; defaultAuthKeyExpiryHours: number }>("/api/settings"),
  updateSettings: (body: { name?: string; appsBaseDomain?: string; defaultAuthKeyExpiryHours?: number }) =>
    request("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
};
