package org

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
	"otterscale/core/internal/machines"
)

type Org struct {
	ID                             string `json:"id"`
	Name                           string `json:"name"`
	Slug                           string `json:"slug"`
	SetupComplete                  bool   `json:"setupComplete"`
	AppsBaseDomain                 string `json:"appsBaseDomain"`
	DefaultAuthKeyExpiryHours      int    `json:"defaultAuthKeyExpiryHours"`
	SuperAdminsImplicitTenantAdmin bool   `json:"superAdminsImplicitTenantAdmin"`
}

func appsBaseDomain(stored string) string {
	if env := strings.TrimSpace(os.Getenv("APPS_BASE_DOMAIN")); env != "" {
		return env
	}
	if stored = strings.TrimSpace(stored); stored != "" {
		return stored
	}
	return "apps.localhost"
}

func Default(ctx context.Context, database *db.DB) (Org, error) {
	var organisation Org
	err := database.QueryRow(ctx, `SELECT "id", "name", "slug" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1`).Scan(&organisation.ID, &organisation.Name, &organisation.Slug)
	if errors.Is(err, sql.ErrNoRows) {
		organisation.ID = id.New()
		organisation.Name = "Otterscale"
		organisation.Slug = "default"
		now := time.Now().UTC()
		if _, err := database.Exec(ctx, `INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES (?,?,?,?,?)`, organisation.ID, organisation.Name, organisation.Slug, now, now); err != nil {
			return Org{}, err
		}
		settingsID := id.New()
		domain := appsBaseDomain("")
		if _, err := database.Exec(ctx, `INSERT INTO "OrganizationSettings" ("id","organizationId","setupComplete","superAdminsImplicitTenantAdmin","appsBaseDomain","defaultAuthKeyExpiryHours","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)`,
			settingsID, organisation.ID, false, true, domain, 24, now, now); err != nil {
			return Org{}, err
		}
		organisation.SetupComplete = false
		organisation.AppsBaseDomain = domain
		organisation.DefaultAuthKeyExpiryHours = 24
		organisation.SuperAdminsImplicitTenantAdmin = true
		return organisation, nil
	}
	if err != nil {
		return Org{}, err
	}
	_ = database.QueryRow(ctx, `SELECT "setupComplete","appsBaseDomain","defaultAuthKeyExpiryHours","superAdminsImplicitTenantAdmin" FROM "OrganizationSettings" WHERE "organizationId"=?`, organisation.ID).
		Scan(&organisation.SetupComplete, &organisation.AppsBaseDomain, &organisation.DefaultAuthKeyExpiryHours, &organisation.SuperAdminsImplicitTenantAdmin)
	organisation.AppsBaseDomain = appsBaseDomain(organisation.AppsBaseDomain)
	if organisation.DefaultAuthKeyExpiryHours == 0 {
		organisation.DefaultAuthKeyExpiryHours = 24
	}
	return organisation, nil
}

func HasOwner(ctx context.Context, database *db.DB) (bool, error) {
	var n int
	err := database.QueryRow(ctx, `SELECT COUNT(*) FROM "PlatformMembership" WHERE "role"='OWNER'`).Scan(&n)
	return n > 0, err
}

func Update(ctx context.Context, database *db.DB, name, appsDomain string, expiryHours int) error {
	organisation, err := Default(ctx, database)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if name != "" {
		_, _ = database.Exec(ctx, `UPDATE "Organization" SET "name"=?,"updatedAt"=? WHERE "id"=?`, name, now, organisation.ID)
	}
	if appsDomain != "" || expiryHours > 0 {
		if appsDomain == "" {
			appsDomain = organisation.AppsBaseDomain
		}
		if expiryHours < 1 {
			expiryHours = organisation.DefaultAuthKeyExpiryHours
		}
		_, err = database.Exec(ctx, `UPDATE "OrganizationSettings" SET "appsBaseDomain"=?,"defaultAuthKeyExpiryHours"=?,"updatedAt"=? WHERE "organizationId"=?`, appsDomain, expiryHours, now, organisation.ID)
	}
	return err
}

func Bootstrap(ctx context.Context, database *db.DB, userID, email string) error {
	has, err := HasOwner(ctx, database)
	if err != nil {
		return err
	}
	if has {
		return nil
	}
	organisation, err := Default(ctx, database)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, role := range []string{"OWNER", "SUPER_ADMIN"} {
		_, _ = database.Exec(ctx, `INSERT INTO "PlatformMembership" ("id","userId","role","createdAt") VALUES (?,?,?,?)`, id.New(), userID, role, now)
	}
	var n int
	_ = database.QueryRow(ctx, `SELECT COUNT(*) FROM "TenantMembership" WHERE "userId"=?`, userID).Scan(&n)
	if n == 0 {
		_, _ = database.Exec(ctx, `INSERT INTO "TenantMembership" ("id","userId","role","createdAt") VALUES (?,?,?,?)`, id.New(), userID, "ADMIN", now)
	}
	for _, slug := range []string{"prod", "uat", "dev"} {
		_, _ = database.Exec(ctx, `INSERT INTO "Tag" ("id","organizationId","name","slug","aclTag","createdAt") VALUES (?,?,?,?,?,?)`,
			id.New(), organisation.ID, slug, slug, machines.ACLTagForSlug(slug), now)
	}
	email = strings.ToLower(email)
	for _, name := range []string{"platform", "admin"} {
		var groupID string
		err = database.QueryRow(ctx, `SELECT "id" FROM "Group" WHERE "organizationId"=? AND "name"=?`, organisation.ID, name).Scan(&groupID)
		if err == sql.ErrNoRows {
			groupID = id.New()
			if _, err = database.Exec(ctx, `INSERT INTO "Group" ("id","organizationId","name","createdAt","updatedAt") VALUES (?,?,?,?,?)`, groupID, organisation.ID, name, now, now); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		var members int
		_ = database.QueryRow(ctx, `SELECT COUNT(*) FROM "GroupMember" WHERE "groupId"=? AND "email"=?`, groupID, email).Scan(&members)
		if members == 0 {
			_, _ = database.Exec(ctx, `INSERT INTO "GroupMember" ("id","groupId","userId","email","createdAt") VALUES (?,?,?,?,?)`, id.New(), groupID, userID, email, now)
		}
		var memberships int
		_ = database.QueryRow(ctx, `SELECT COUNT(*) FROM "WorkspaceMembership" WHERE "userId"=? AND "groupId"=?`, userID, groupID).Scan(&memberships)
		if memberships == 0 {
			_, _ = database.Exec(ctx, `INSERT INTO "WorkspaceMembership" ("id","userId","groupId","role","createdAt") VALUES (?,?,?,?,?)`, id.New(), userID, groupID, "ADMIN", now)
		}
	}
	_, _ = database.Exec(ctx, `UPDATE "OrganizationSettings" SET "setupComplete"=?, "updatedAt"=? WHERE "organizationId"=?`, true, now, organisation.ID)
	return audit.Append(ctx, database, organisation.ID, userID, "auth.owner_bootstrapped", "SYSTEM", "user", userID, map[string]string{"email": email})
}
