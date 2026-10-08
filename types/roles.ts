export type PlatformRole = "OWNER" | "SUPER_ADMIN";
export type TenantRole = "TENANT_ADMIN" | "NET_ADMIN" | "AUDITOR" | "MEMBER";

export type Capability =
  | "platform.view"
  | "platform.manage_admins"
  | "platform.settings"
  | "workspace.manage"
  | "workspace.policy"
  | "network.manage"
  | "network.view"
  | "audit.view"
  | "audit.export"
  | "members.view"
  | "members.invite";

export type UserCapabilities = {
  userId: string;
  email: string;
  platformRoles: PlatformRole[];
  tenantRole: TenantRole | null;
  capabilities: Capability[];
  isOwner: boolean;
};
