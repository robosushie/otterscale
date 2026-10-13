package store

import (
	"context"
	"database/sql"
	"time"

	"otterscale/core/internal/apps"
	"otterscale/core/internal/audit"
	"otterscale/core/internal/authz"
	"otterscale/core/internal/db"
	"otterscale/core/internal/headscale"
	"otterscale/core/internal/id"
	"otterscale/core/internal/machines"
	"otterscale/core/internal/members"
	"otterscale/core/internal/org"
	"otterscale/core/internal/policy"
	"otterscale/core/internal/workspace"
)

type Store struct {
	DB *db.DB
}

func New(database *db.DB) *Store { return &Store{DB: database} }

type Org = org.Org
type User = members.User
type Invite = members.Invite
type MachinesTable = machines.Table
type UserRow = members.Row
type AuditRow = audit.Row
type WorkspaceRow = workspace.Row
type PolicyView = policy.View
type AppRow = apps.Row

func (s *Store) DefaultOrg(ctx context.Context) (Org, error) {
	return org.Default(ctx, s.DB)
}

func (s *Store) HasOwner(ctx context.Context) (bool, error) {
	return org.HasOwner(ctx, s.DB)
}

func (s *Store) UpdateOrg(ctx context.Context, name, appsDomain string, expiryHours int) error {
	return org.Update(ctx, s.DB, name, appsDomain, expiryHours)
}

func (s *Store) BootstrapOwner(ctx context.Context, userID, email string) error {
	return org.Bootstrap(ctx, s.DB, userID, email)
}

func (s *Store) FindUser(ctx context.Context, ident string) (User, error) {
	return members.Find(ctx, s.DB, ident)
}

func (s *Store) UserByID(ctx context.Context, userID string) (User, error) {
	return members.ByID(ctx, s.DB, userID)
}

func (s *Store) Users(ctx context.Context) ([]UserRow, error) {
	return members.List(ctx, s.DB)
}

func (s *Store) CreateInvite(ctx context.Context, actorID, email, username, tenantRole string, platformRole *string, groupIDs []string) (string, string, time.Time, error) {
	return members.CreateInvite(ctx, s.DB, actorID, email, username, tenantRole, platformRole, groupIDs)
}

func (s *Store) FindInviteByCode(ctx context.Context, code string) (Invite, error) {
	return members.FindInviteByCode(ctx, s.DB, code)
}

func (s *Store) ApplyInvite(ctx context.Context, userID, email string, invite Invite) error {
	return members.ApplyInvite(ctx, s.DB, userID, email, invite)
}

func (s *Store) RevokeInvite(ctx context.Context, inviteID string) error {
	return members.RevokeInvite(ctx, s.DB, inviteID)
}

func (s *Store) UpsertOIDCUser(ctx context.Context, sub, email, name string) (string, error) {
	return members.UpsertOIDCUser(ctx, s.DB, sub, email, name)
}

func (s *Store) Workspaces(ctx context.Context) ([]WorkspaceRow, error) {
	return workspace.List(ctx, s.DB)
}

func (s *Store) CreateWorkspace(ctx context.Context, actorID, name string) error {
	return workspace.Create(ctx, s.DB, actorID, name)
}

func (s *Store) AddWorkspaceMember(ctx context.Context, actorID, groupID, email, role string) error {
	return workspace.AddMember(ctx, s.DB, actorID, groupID, email, role)
}

func (s *Store) Tags(ctx context.Context, orgID string) ([]machines.TagOption, error) {
	return workspace.Tags(ctx, s.DB, orgID)
}

func (s *Store) CreateTag(ctx context.Context, actorID, name string) error {
	return workspace.CreateTag(ctx, s.DB, actorID, name)
}

func (s *Store) CreateAccessRule(ctx context.Context, actorID, groupID, tagID, ports string) error {
	return workspace.CreateRule(ctx, s.DB, actorID, groupID, tagID, ports)
}

func (s *Store) CompileInput(ctx context.Context, orgID string) (policy.CompileInput, error) {
	return policy.CompileInputFor(ctx, s.DB, orgID)
}

func (s *Store) SavePolicy(ctx context.Context, orgID, authorID string, compiled policy.CompiledPolicy, status, errMsg string) (string, error) {
	return policy.Save(ctx, s.DB, orgID, authorID, compiled, status, errMsg)
}

func (s *Store) Policies(ctx context.Context) ([]PolicyView, error) {
	return policy.List(ctx, s.DB)
}

func (s *Store) Apps(ctx context.Context) ([]AppRow, error) {
	return apps.List(ctx, s.DB)
}

func (s *Store) UpsertApp(ctx context.Context, actorID, appID, machineID, subdomain string, port int, status, lastError string) error {
	return apps.Upsert(ctx, s.DB, actorID, appID, machineID, subdomain, port, status, lastError)
}

func (s *Store) DeleteApp(ctx context.Context, actorID, appID string) error {
	return apps.Delete(ctx, s.DB, actorID, appID)
}

func (s *Store) WriteAppRoutes(ctx context.Context, organisation Org) error {
	return apps.WriteRoutes(ctx, s.DB, organisation)
}

func (s *Store) Audit(ctx context.Context, orgID, actorID, action, category, resourceType, resourceID string, after any) error {
	return audit.Append(ctx, s.DB, orgID, actorID, action, category, resourceType, resourceID, after)
}

func (s *Store) AuditRows(ctx context.Context, category string) ([]AuditRow, error) {
	organisation, err := org.Default(ctx, s.DB)
	if err != nil {
		return nil, err
	}
	return audit.Rows(ctx, s.DB, organisation.ID, category)
}

func (s *Store) SyncMachines(ctx context.Context, orgID string, nodes []headscale.Node) error {
	groups, err := workspace.NamedGroups(ctx, s.DB, orgID)
	if err != nil {
		return err
	}
	tags, err := workspace.Tags(ctx, s.DB, orgID)
	if err != nil {
		return err
	}
	return machines.Sync(ctx, s.DB, orgID, nodes, groups, tags)
}

func (s *Store) MachinesTable(ctx context.Context, authz Capabilities, nodes []headscale.Node, hsErr string, configured bool, loginServer string) (MachinesTable, error) {
	organisation, err := org.Default(ctx, s.DB)
	if err != nil {
		return MachinesTable{}, err
	}
	groups, err := workspace.NamedGroups(ctx, s.DB, organisation.ID)
	if err != nil {
		return MachinesTable{}, err
	}
	tags, err := workspace.Tags(ctx, s.DB, organisation.ID)
	if err != nil {
		return MachinesTable{}, err
	}
	return machines.BuildTable(ctx, s.DB, organisation.ID, machines.Viewer{
		IsPlatformAdmin: authz.IsPlatformAdmin,
		WorkspaceIDs:    authz.WorkspaceIDs,
		Capabilities:    authz.Capabilities,
	}, nodes, hsErr, configured, loginServer, groups, tags)
}

func (s *Store) CreateSession(ctx context.Context, userID string) (string, error) {
	token := id.New() + id.New()
	_, err := s.DB.Exec(ctx, `INSERT INTO "Session" ("id","sessionToken","userId","expires") VALUES (?,?,?,?)`,
		id.New(), token, userID, time.Now().UTC().Add(14*24*time.Hour))
	return token, err
}

func (s *Store) UserIDForSession(ctx context.Context, token string) (string, error) {
	var userID string
	var expires time.Time
	err := s.DB.QueryRow(ctx, `SELECT "userId","expires" FROM "Session" WHERE "sessionToken"=?`, token).Scan(&userID, &expires)
	if err != nil {
		return "", err
	}
	if time.Now().After(expires) {
		_, _ = s.DB.Exec(ctx, `DELETE FROM "Session" WHERE "sessionToken"=?`, token)
		return "", sql.ErrNoRows
	}
	return userID, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM "Session" WHERE "sessionToken"=?`, token)
	return err
}

type Capabilities struct {
	UserID          string   `json:"userId"`
	Email           string   `json:"email"`
	Name            *string  `json:"name"`
	PlatformRoles   []string `json:"platformRoles"`
	TenantRole      *string  `json:"tenantRole"`
	Capabilities    []string `json:"capabilities"`
	IsOwner         bool     `json:"isOwner"`
	IsPlatformAdmin bool     `json:"isPlatformAdmin"`
	WorkspaceIDs    []string `json:"workspaceIds"`
}

func (s *Store) LoadCapabilities(ctx context.Context, userID string) (Capabilities, error) {
	user, err := members.ByID(ctx, s.DB, userID)
	if err != nil {
		return Capabilities{}, err
	}
	organisation, err := org.Default(ctx, s.DB)
	if err != nil {
		return Capabilities{}, err
	}
	rows, err := s.DB.Query(ctx, `SELECT "role" FROM "PlatformMembership" WHERE "userId"=?`, userID)
	if err != nil {
		return Capabilities{}, err
	}
	defer rows.Close()
	var roles []string
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return Capabilities{}, err
		}
		roles = append(roles, role)
	}
	if roles == nil {
		roles = []string{}
	}
	var tenant sql.NullString
	_ = s.DB.QueryRow(ctx, `SELECT "role" FROM "TenantMembership" WHERE "userId"=? ORDER BY "createdAt" ASC LIMIT 1`, userID).Scan(&tenant)
	admin := contains(roles, "OWNER") || contains(roles, "SUPER_ADMIN")
	var workspaceIDs []string
	if admin {
		wrows, err := s.DB.Query(ctx, `SELECT "id" FROM "Group" WHERE "organizationId"=?`, organisation.ID)
		if err != nil {
			return Capabilities{}, err
		}
		defer wrows.Close()
		for wrows.Next() {
			var id string
			if err := wrows.Scan(&id); err != nil {
				return Capabilities{}, err
			}
			workspaceIDs = append(workspaceIDs, id)
		}
	} else {
		wrows, err := s.DB.Query(ctx, `SELECT "groupId" FROM "WorkspaceMembership" WHERE "userId"=?`, userID)
		if err != nil {
			return Capabilities{}, err
		}
		defer wrows.Close()
		for wrows.Next() {
			var id string
			if err := wrows.Scan(&id); err != nil {
				return Capabilities{}, err
			}
			workspaceIDs = append(workspaceIDs, id)
		}
	}
	if workspaceIDs == nil {
		workspaceIDs = []string{}
	}
	caps := authz.Resolve(authz.Context{
		PlatformRoles: roles, TenantRole: tenant.String, SuperAdminsImplicitTenantAdmin: organisation.SuperAdminsImplicitTenantAdmin,
	})
	outCaps := make([]string, len(caps))
	for i, c := range caps {
		outCaps[i] = string(c)
	}
	var name *string
	if user.Name.Valid {
		name = &user.Name.String
	}
	var tenantRole *string
	if tenant.Valid {
		tenantRole = &tenant.String
	}
	return Capabilities{
		UserID: user.ID, Email: user.Email, Name: name, PlatformRoles: roles, TenantRole: tenantRole,
		Capabilities: outCaps, IsOwner: contains(roles, "OWNER"), IsPlatformAdmin: admin, WorkspaceIDs: workspaceIDs,
	}, nil
}

func contains(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
