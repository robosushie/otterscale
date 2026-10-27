package members

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/auth"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
	"otterscale/core/internal/org"
)

type Invite struct {
	ID             string
	OrganizationID string
	Email          string
	Username       string
	TenantRole     string
	PlatformRole   sql.NullString
	GroupIDs       []string
}

func CreateInvite(ctx context.Context, database *db.DB, actorID, email, username, tenantRole string, platformRole *string, groupIDs []string) (code, inviteID string, expires time.Time, err error) {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return "", "", time.Time{}, err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	username = strings.TrimSpace(username)
	selector, verifier, err := newInviteCode()
	if err != nil {
		return "", "", time.Time{}, err
	}
	code = selector + "." + verifier
	now := time.Now().UTC()
	expires = now.Add(7 * 24 * time.Hour)
	_, _ = database.Exec(ctx, `UPDATE "UserInvite" SET "revokedAt"=? WHERE "organizationId"=? AND lower("email")=? AND "redeemedAt" IS NULL AND "revokedAt" IS NULL`, now, organisation.ID, email)
	inviteID = id.New()
	var role any
	if platformRole != nil && *platformRole != "" {
		role = *platformRole
	}
	if _, err := database.Exec(ctx, `INSERT INTO "UserInvite" ("id","organizationId","email","username","codeHash","codeSelector","tenantRole","platformRole","createdById","expiresAt","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		inviteID, organisation.ID, email, username, auth.TokenHash(verifier), selector, tenantRole, role, actorID, expires, now); err != nil {
		return "", "", time.Time{}, err
	}
	for _, groupID := range groupIDs {
		if _, err := database.Exec(ctx, `INSERT INTO "UserInviteWorkspace" ("inviteId","groupId") VALUES (?,?)`, inviteID, groupID); err != nil {
			return "", "", time.Time{}, err
		}
	}
	_ = audit.Append(ctx, database, organisation.ID, actorID, "member.invite_created", "SYSTEM", "user_invite", inviteID, map[string]any{
		"email": email, "username": username, "tenantRole": tenantRole, "platformRole": role, "workspaceIds": groupIDs,
	})
	return code, inviteID, expires, nil
}

func newInviteCode() (selector, verifier string, err error) {
	sel := make([]byte, 16)
	ver := make([]byte, 32)
	if _, err = rand.Read(sel); err != nil {
		return "", "", err
	}
	if _, err = rand.Read(ver); err != nil {
		return "", "", err
	}
	return base64.RawURLEncoding.EncodeToString(sel), base64.RawURLEncoding.EncodeToString(ver), nil
}

func splitInviteCode(code string) (selector, verifier string, ok bool) {
	selector, verifier, ok = strings.Cut(strings.TrimSpace(code), ".")
	if !ok || selector == "" || verifier == "" || strings.Contains(verifier, ".") {
		return "", "", false
	}
	return selector, verifier, true
}

func FindInviteByCode(ctx context.Context, database *db.DB, code string) (Invite, error) {
	selector, verifier, ok := splitInviteCode(code)
	if !ok {
		return Invite{}, sql.ErrNoRows
	}
	var invite Invite
	var hash string
	var expires time.Time
	err := database.QueryRow(ctx, `SELECT "id","organizationId","email","username","codeHash","tenantRole","platformRole","expiresAt" FROM "UserInvite" WHERE "codeSelector"=? AND "revokedAt" IS NULL AND "redeemedAt" IS NULL`, selector).
		Scan(&invite.ID, &invite.OrganizationID, &invite.Email, &invite.Username, &hash, &invite.TenantRole, &invite.PlatformRole, &expires)
	if !auth.TokenEqual(verifier, hash) || err != nil || !expires.After(time.Now().UTC()) {
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return Invite{}, err
		}
		return Invite{}, sql.ErrNoRows
	}
	ids, err := database.Query(ctx, `SELECT "groupId" FROM "UserInviteWorkspace" WHERE "inviteId"=?`, invite.ID)
	if err != nil {
		return Invite{}, err
	}
	defer ids.Close()
	for ids.Next() {
		var groupID string
		_ = ids.Scan(&groupID)
		invite.GroupIDs = append(invite.GroupIDs, groupID)
	}
	return invite, ids.Err()
}

func ApplyInvite(ctx context.Context, database *db.DB, userID, email string, invite Invite) error {
	now := time.Now().UTC()
	res, err := database.Exec(ctx, `UPDATE "UserInvite" SET "redeemedAt"=?, "redeemedByUserId"=? WHERE "id"=? AND "redeemedAt" IS NULL`, now, userID, invite.ID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return errors.New("invite already redeemed")
	}
	if invite.PlatformRole.Valid && invite.PlatformRole.String == "SUPER_ADMIN" {
		_, _ = database.Exec(ctx, `INSERT INTO "PlatformMembership" ("id","userId","role","createdAt") VALUES (?,?,?,?) ON CONFLICT ("userId","role") DO NOTHING`, id.New(), userID, "SUPER_ADMIN", now)
	}
	var tenantID string
	err = database.QueryRow(ctx, `SELECT "id" FROM "TenantMembership" WHERE "userId"=? ORDER BY "createdAt" ASC LIMIT 1`, userID).Scan(&tenantID)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = database.Exec(ctx, `INSERT INTO "TenantMembership" ("id","userId","role","createdAt") VALUES (?,?,?,?)`, id.New(), userID, invite.TenantRole, now)
	} else if err == nil {
		_, err = database.Exec(ctx, `UPDATE "TenantMembership" SET "role"=? WHERE "id"=?`, invite.TenantRole, tenantID)
	}
	if err != nil {
		return err
	}
	groupIDs := map[string]struct{}{}
	for _, groupID := range invite.GroupIDs {
		groupIDs[groupID] = struct{}{}
	}
	linked, err := database.Query(ctx, `SELECT "groupId" FROM "GroupMember" WHERE lower("email")=?`, strings.ToLower(email))
	if err != nil {
		return err
	}
	for linked.Next() {
		var groupID string
		_ = linked.Scan(&groupID)
		groupIDs[groupID] = struct{}{}
	}
	linked.Close()
	for groupID := range groupIDs {
		_, err = database.Exec(ctx, `INSERT INTO "GroupMember" ("id","groupId","userId","email","createdAt") VALUES (?,?,?,?,?) ON CONFLICT ("groupId","email") DO UPDATE SET "userId"=excluded."userId"`,
			id.New(), groupID, userID, strings.ToLower(email), now)
		if err != nil {
			return err
		}
		_, err = database.Exec(ctx, `INSERT INTO "WorkspaceMembership" ("id","userId","groupId","role","createdAt") VALUES (?,?,?,?,?) ON CONFLICT ("userId","groupId") DO UPDATE SET "role"=excluded."role"`,
			id.New(), userID, groupID, invite.TenantRole, now)
		if err != nil {
			return err
		}
	}
	return audit.Append(ctx, database, invite.OrganizationID, userID, "member.invite_redeemed", "SYSTEM", "user_invite", invite.ID, nil)
}

type PendingInvite struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Username     string    `json:"username"`
	TenantRole   string    `json:"tenantRole"`
	PlatformRole *string   `json:"platformRole"`
	ExpiresAt    time.Time `json:"expiresAt"`
	WorkspaceIDs []string  `json:"workspaceIds"`
	Workspaces   []string  `json:"workspaces"`
}

func ListPending(ctx context.Context, database *db.DB) ([]PendingInvite, error) {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return nil, err
	}
	rows, err := database.Query(ctx, `SELECT "id","email","username","tenantRole","platformRole","expiresAt" FROM "UserInvite" WHERE "organizationId"=? AND "revokedAt" IS NULL AND "redeemedAt" IS NULL AND "expiresAt">? ORDER BY "createdAt" DESC`, organisation.ID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingInvite
	for rows.Next() {
		var row PendingInvite
		var platform sql.NullString
		if err := rows.Scan(&row.ID, &row.Email, &row.Username, &row.TenantRole, &platform, &row.ExpiresAt); err != nil {
			return nil, err
		}
		if platform.Valid && platform.String != "" {
			role := platform.String
			row.PlatformRole = &role
		}
		row.WorkspaceIDs = []string{}
		row.Workspaces = []string{}
		memberships, qerr := database.Query(ctx, `SELECT g."id", g."name" FROM "UserInviteWorkspace" m JOIN "Group" g ON g."id"=m."groupId" WHERE m."inviteId"=? ORDER BY g."name"`, row.ID)
		if qerr == nil {
			for memberships.Next() {
				var groupID, name string
				if err := memberships.Scan(&groupID, &name); err != nil {
					memberships.Close()
					return nil, err
				}
				row.WorkspaceIDs = append(row.WorkspaceIDs, groupID)
				row.Workspaces = append(row.Workspaces, name)
			}
			if err := memberships.Err(); err != nil {
				memberships.Close()
				return nil, err
			}
			memberships.Close()
		}
		out = append(out, row)
	}
	if out == nil {
		out = []PendingInvite{}
	}
	return out, nil
}

func ReplaceInviteWorkspaces(ctx context.Context, database *db.DB, inviteID string, groupIDs []string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	var found string
	err = database.QueryRow(ctx, `SELECT "id" FROM "UserInvite" WHERE "id"=? AND "organizationId"=? AND "redeemedAt" IS NULL AND "revokedAt" IS NULL`, inviteID, organisation.ID).Scan(&found)
	if err != nil {
		return errors.New("Invite not found")
	}
	if _, err := database.Exec(ctx, `DELETE FROM "UserInviteWorkspace" WHERE "inviteId"=?`, inviteID); err != nil {
		return err
	}
	for _, groupID := range groupIDs {
		if strings.TrimSpace(groupID) == "" {
			continue
		}
		if _, err := database.Exec(ctx, `INSERT INTO "UserInviteWorkspace" ("inviteId","groupId") VALUES (?,?)`, inviteID, groupID); err != nil {
			return err
		}
	}
	return nil
}

func RevokeInvite(ctx context.Context, database *db.DB, inviteID string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	_, err = database.Exec(ctx, `UPDATE "UserInvite" SET "revokedAt"=? WHERE "id"=? AND "organizationId"=? AND "redeemedAt" IS NULL AND "revokedAt" IS NULL`, time.Now().UTC(), inviteID, organisation.ID)
	return err
}

func UpsertOIDCUser(ctx context.Context, database *db.DB, sub, email, name string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	sub = strings.TrimSpace(sub)
	if email == "" || sub == "" {
		return "", errors.New("OIDC account is missing email or subject")
	}
	var userID string
	err := database.QueryRow(ctx, `SELECT "id" FROM "User" WHERE "oidcSub"=?`, sub).Scan(&userID)
	if err == nil {
		return userID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	err = database.QueryRow(ctx, `SELECT "id" FROM "User" WHERE lower("email")=?`, email).Scan(&userID)
	now := time.Now().UTC()
	if err == nil {
		_, err = database.Exec(ctx, `UPDATE "User" SET "oidcSub"=?, "emailVerified"=COALESCE("emailVerified", ?), "updatedAt"=? WHERE "id"=?`, sub, now, now, userID)
		return userID, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	username, err := uniqueUsername(ctx, database, email)
	if err != nil {
		return "", err
	}
	userID = id.New()
	var display any
	if strings.TrimSpace(name) != "" {
		display = name
	}
	_, err = database.Exec(ctx, `INSERT INTO "User" ("id","username","email","emailVerified","name","oidcSub","totpEnabled","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)`,
		userID, username, email, now, display, sub, false, now, now)
	return userID, err
}

func uniqueUsername(ctx context.Context, database *db.DB, email string) (string, error) {
	local := strings.Split(email, "@")[0]
	var b strings.Builder
	for _, r := range strings.ToLower(local) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		}
	}
	base := strings.Trim(b.String(), ".-_")
	if len(base) < 3 {
		base = "user"
	}
	if len(base) > 24 {
		base = base[:24]
	}
	for i := 0; i < 20; i++ {
		candidate := base
		if i > 0 {
			candidate = base + "-" + id.New()[:6]
		}
		var n int
		if err := database.QueryRow(ctx, `SELECT COUNT(*) FROM "User" WHERE "username"=?`, candidate).Scan(&n); err != nil {
			return "", err
		}
		if n == 0 {
			return candidate, nil
		}
	}
	return "", errors.New("could not allocate a username")
}
