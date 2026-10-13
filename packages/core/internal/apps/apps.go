package apps

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
	"otterscale/core/internal/org"
)

type Row struct {
	ID        string `json:"id"`
	MachineID string `json:"machineId"`
	Machine   string `json:"machine"`
	Port      int    `json:"port"`
	Subdomain string `json:"subdomain"`
	Status    string `json:"status"`
	LastError string `json:"lastError"`
}

func List(ctx context.Context, database *db.DB) ([]Row, error) {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return nil, err
	}
	rows, err := database.Query(ctx, `SELECT a."id", a."machineId", m."name", a."port", a."subdomain", a."status", COALESCE(a."lastError",'') FROM "PublishedApp" a JOIN "Machine" m ON m."id"=a."machineId" WHERE a."organizationId"=? ORDER BY a."subdomain" ASC`, organisation.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var row Row
		if err := rows.Scan(&row.ID, &row.MachineID, &row.Machine, &row.Port, &row.Subdomain, &row.Status, &row.LastError); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []Row{}
	}
	return out, nil
}

func Upsert(ctx context.Context, database *db.DB, actorID, appID, machineID, subdomain string, port int, status, lastError string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
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
