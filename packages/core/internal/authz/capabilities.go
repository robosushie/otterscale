package authz

type Capability string

const (
	PlatformView         Capability = "platform.view"
	PlatformManageAdmins Capability = "platform.manage_admins"
	PlatformSettings     Capability = "platform.settings"
	WorkspaceManage      Capability = "workspace.manage"
	WorkspacePolicy      Capability = "workspace.policy"
	NetworkManage        Capability = "network.manage"
	NetworkView          Capability = "network.view"
	AuditView            Capability = "audit.view"
	AuditExport          Capability = "audit.export"
	MembersView          Capability = "members.view"
	MembersInvite        Capability = "members.invite"
)

var adminCaps = []Capability{
	WorkspaceManage, WorkspacePolicy, NetworkManage, NetworkView, AuditView, AuditExport, MembersView, MembersInvite,
}

var memberCaps = []Capability{NetworkView, MembersView, AuditView}

type Context struct {
	PlatformRoles                  []string
	TenantRole                     string
	SuperAdminsImplicitTenantAdmin bool
}

func Resolve(ctx Context) []Capability {
	caps := map[Capability]struct{}{}
	add := func(list []Capability) {
		for _, c := range list {
			caps[c] = struct{}{}
		}
	}
	owner := has(ctx.PlatformRoles, "OWNER")
	super := has(ctx.PlatformRoles, "SUPER_ADMIN")
	if owner {
		add([]Capability{PlatformView, PlatformManageAdmins, PlatformSettings})
	} else if super {
		add([]Capability{PlatformView})
	}
	role := ctx.TenantRole
	if role == "" && ctx.SuperAdminsImplicitTenantAdmin && (owner || super) {
		role = "ADMIN"
	}
	switch role {
	case "ADMIN":
		add(adminCaps)
	case "MEMBER":
		add(memberCaps)
	}
	if (owner || super) && ctx.SuperAdminsImplicitTenantAdmin {
		add(adminCaps)
	}
	out := make([]Capability, 0, len(caps))
	for c := range caps {
		out = append(out, c)
	}
	return out
}

func Has(caps []Capability, required Capability) bool {
	for _, c := range caps {
		if c == required {
			return true
		}
	}
	return false
}

func has(roles []string, want string) bool {
	for _, role := range roles {
		if role == want {
			return true
		}
	}
	return false
}
