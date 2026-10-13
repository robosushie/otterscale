package audit

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
)

type Row struct {
	ID        string `json:"id"`
	Action    string `json:"action"`
	Category  string `json:"category"`
	Actor     string `json:"actor"`
	CreatedAt string `json:"createdAt"`
}

func Append(ctx context.Context, database *db.DB, orgID, actorID, action, category, resourceType, resourceID string, after any) error {
	var prev string
	err := database.QueryRow(ctx, `SELECT "eventHash" FROM "AuditEvent" WHERE "organizationId"=? ORDER BY "createdAt" DESC LIMIT 1`, orgID).Scan(&prev)
	if errors.Is(err, sql.ErrNoRows) {
		prev = "genesis"
	} else if err != nil {
		return err
	}
	canonical, _ := json.Marshal(map[string]any{
		"action": action, "actorId": Empty(actorID), "resourceType": Empty(resourceType),
		"resourceId": Empty(resourceID), "before": nil, "after": after, "at": time.Now().UTC().Format(time.RFC3339Nano),
	})
	sum := sha256.Sum256([]byte(prev + string(canonical)))
	var afterJSON any
	if after != nil {
		raw, _ := json.Marshal(after)
		afterJSON = string(raw)
	}
	var actor any
	if actorID != "" {
		actor = actorID
	}
	_, err = database.Exec(ctx, `INSERT INTO "AuditEvent" ("id","organizationId","actorId","action","category","resourceType","resourceId","afterJson","previousHash","eventHash","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		id.New(), orgID, actor, action, categoryOr(category), Empty(resourceType), Empty(resourceID), afterJSON, prev, hex.EncodeToString(sum[:]), time.Now().UTC())
	return err
}

func Rows(ctx context.Context, database *db.DB, orgID, category string) ([]Row, error) {
	rows, err := database.Query(ctx, `SELECT e."id", e."action", e."category", COALESCE(u."email",''), e."createdAt" FROM "AuditEvent" e LEFT JOIN "User" u ON u."id"=e."actorId" WHERE e."organizationId"=? AND e."category"=? ORDER BY e."createdAt" DESC LIMIT 200`, orgID, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var row Row
		var created time.Time
		if err := rows.Scan(&row.ID, &row.Action, &row.Category, &row.Actor, &created); err != nil {
			return nil, err
		}
		row.CreatedAt = created.UTC().Format(time.RFC3339)
		out = append(out, row)
	}
	if out == nil {
		out = []Row{}
	}
	return out, nil
}

func Empty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func categoryOr(v string) string {
	if v == "" {
		return "SYSTEM"
	}
	return v
}
