package apps

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
	"otterscale/core/internal/machines"
	"otterscale/core/internal/org"
)

type Row struct {
	ID        string `json:"id"`
	MachineID string `json:"machineId"`
	Machine   string `json:"machine"`
	Port      int    `json:"port"`
	Subdomain string `json:"subdomain"`
	Status    string `json:"status"`
	LastError   string   `json:"lastError"`
	AddedBy     string   `json:"addedBy"`
	CreatedByID string   `json:"createdById"`
	Workspaces  []string `json:"workspaces"`
}

func List(ctx context.Context, database *db.DB, platformAdmin bool, workspaceIDs []string) ([]Row, error) {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return nil, err
	}
	rows, err := database.Query(ctx, `SELECT a."id", a."machineId", a."createdById", m."name", a."port", a."subdomain", a."status", COALESCE(a."lastError",''), COALESCE(u."name",''), COALESCE(u."username",''), COALESCE(u."email",'') FROM "PublishedApp" a JOIN "Machine" m ON m."id"=a."machineId" LEFT JOIN "User" u ON u."id"=a."createdById" WHERE a."organizationId"=? ORDER BY a."subdomain" ASC`, organisation.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var row Row
		var creator sql.NullString
		var name, username, email string
		if err := rows.Scan(&row.ID, &row.MachineID, &creator, &row.Machine, &row.Port, &row.Subdomain, &row.Status, &row.LastError, &name, &username, &email); err != nil {
			return nil, err
		}
		if creator.Valid {
			row.CreatedByID = creator.String
		}
		wsIDs, names := appWorkspaces(ctx, database, row.MachineID)
		if !machines.MachineVisible(wsIDs, platformAdmin, workspaceIDs) {
			continue
		}
		row.Workspaces = names
		row.AddedBy = addedBy(name, username, email)
		out = append(out, row)
	}
	if out == nil {
		out = []Row{}
	}
	return out, nil
}

func addedBy(name, username, email string) string {
	if strings.TrimSpace(name) != "" {
		return name
	}
	if username != "" {
		return username
	}
	if email != "" {
		return email
	}
	return "—"
}

func assertAddedBy(ctx context.Context, database *db.DB, appID, actorID string) error {
	var creator sql.NullString
	err := database.QueryRow(ctx, `SELECT "createdById" FROM "PublishedApp" WHERE "id"=?`, appID).Scan(&creator)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("App not found")
	}
	if err != nil {
		return err
	}
	if !creator.Valid || creator.String != actorID {
		return errors.New("Only the person who added this app can change it.")
	}
	return nil
}

func appWorkspaces(ctx context.Context, database *db.DB, machineID string) (ids, names []string) {
	rows, err := database.Query(ctx, `SELECT g."id", g."name" FROM "MachineWorkspace" mw JOIN "Group" g ON g."id"=mw."groupId" WHERE mw."machineId"=? ORDER BY g."name"`, machineID)
	if err != nil {
		return []string{}, []string{}
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			continue
		}
		ids = append(ids, id)
		names = append(names, name)
	}
	if ids == nil {
		ids = []string{}
	}
	if names == nil {
		names = []string{}
	}
	return ids, names
}

func Upsert(ctx context.Context, database *db.DB, actorID, appID, machineID, subdomain string, port int, status, lastError string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	if appID != "" {
		if err := assertAddedBy(ctx, database, appID, actorID); err != nil {
			return err
		}
	}
	now := time.Now().UTC()
	if appID == "" {
		appID = id.New()
		_, err = database.Exec(ctx, `INSERT INTO "PublishedApp" ("id","organizationId","machineId","port","subdomain","status","lastError","createdById","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?)`,
			appID, organisation.ID, machineID, port, subdomain, status, audit.Empty(lastError), actorID, now, now)
	} else {
		_, err = database.Exec(ctx, `UPDATE "PublishedApp" SET "machineId"=?,"port"=?,"subdomain"=?,"status"=?,"lastError"=?,"updatedAt"=? WHERE "id"=? AND "organizationId"=?`,
			machineID, port, subdomain, status, audit.Empty(lastError), now, appID, organisation.ID)
	}
	if err != nil {
		return err
	}
	return WriteRoutes(ctx, database, organisation)
}

func Delete(ctx context.Context, database *db.DB, actorID, appID string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	if err := assertAddedBy(ctx, database, appID, actorID); err != nil {
		return err
	}
	if _, err := database.Exec(ctx, `DELETE FROM "PublishedApp" WHERE "id"=? AND "organizationId"=?`, appID, organisation.ID); err != nil {
		return err
	}
	_ = audit.Append(ctx, database, organisation.ID, actorID, "app.deleted", "NETWORK", "published_app", appID, nil)
	return WriteRoutes(ctx, database, organisation)
}

func WriteRoutes(ctx context.Context, database *db.DB, organisation org.Org) error {
	path := strings.TrimSpace(os.Getenv("APPS_ROUTES_PATH"))
	if path == "" {
		path = "/data/apps-caddy/routes.json"
	}
	base := organisation.AppsBaseDomain
	if env := strings.TrimSpace(os.Getenv("APPS_BASE_DOMAIN")); env != "" {
		base = env
	}
	rows, err := database.Query(ctx, `SELECT a."id", a."subdomain", a."port", m."ipAddresses" FROM "PublishedApp" a JOIN "Machine" m ON m."id"=a."machineId" WHERE a."organizationId"=? AND a."status"='ACTIVE'`, organisation.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type route struct {
		ID        string `json:"id"`
		Subdomain string `json:"subdomain"`
		IP        string `json:"ip"`
		Port      int    `json:"port"`
	}
	var routes []route
	for rows.Next() {
		var r route
		var ips string
		if err := rows.Scan(&r.ID, &r.Subdomain, &r.Port, &ips); err != nil {
			return err
		}
		var list []string
		_ = json.Unmarshal([]byte(ips), &list)
		if len(list) > 0 {
			r.IP = list[0]
		}
		if r.Subdomain != "" && r.IP != "" && r.Port > 0 {
			routes = append(routes, r)
		}
	}
	if routes == nil {
		routes = []route{}
	}
	raw, _ := json.MarshalIndent(map[string]any{"baseDomain": base, "routes": routes}, "", "  ")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
}
