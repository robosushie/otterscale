export type PlatformRole = "OWNER" | "SUPER_ADMIN";
export type TenantRole = "ADMIN" | "MEMBER";

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
  name: string | null;
  platformRoles: PlatformRole[];
  tenantRole: TenantRole | null;
  capabilities: Capability[];
  isOwner: boolean;
  isPlatformAdmin: boolean;
  workspaceIds: string[];
};
