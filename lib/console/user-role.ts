import type { PlatformRole, TenantRole } from "@prisma/client";

export function accessRoleKey(
  platformRoles: PlatformRole[],
  tenantRoles: TenantRole[],
): "OWNER" | "SUPER_ADMIN" | "ADMIN" | "MEMBER" {
  if (platformRoles.includes("OWNER")) return "OWNER";
  if (platformRoles.includes("SUPER_ADMIN")) return "SUPER_ADMIN";
  if (tenantRoles.includes("ADMIN")) return "ADMIN";
  return "MEMBER";
}

export function displayUserRole(
  platformRoles: PlatformRole[],
  tenantRoles: TenantRole[],
): string {
  if (platformRoles.includes("OWNER")) return "Owner";
  if (platformRoles.includes("SUPER_ADMIN")) return "Super admin";
  const tenant = tenantRoles[0];
  if (tenant === "ADMIN") return "Admin";
  if (tenant === "MEMBER") return "Member";
  return "—";
}

export function workspaceTagName(workspaceName: string): string {
  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "workspace";
  return `tag:ws-${slug}`;
}

export function aclTagForSlug(slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "").replace(/^tag:/, "");
  return `tag:${clean}`;
}
