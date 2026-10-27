package audit

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/hkdf"
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

const (
	epochHMAC = 1
	hmacInfo  = "otterscale-audit-hmac-v1"
	tipInfo   = "otterscale-audit-tip-v1"
)

var appendMu sync.Mutex

type canon struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	ActorID        string `json:"actorId"`
	Action         string `json:"action"`
	Category       string `json:"category"`
	ResourceType   string `json:"resourceType"`
	ResourceID     string `json:"resourceId"`
	AfterJSON      string `json:"afterJson"`
	PreviousHash   string `json:"previousHash"`
	CreatedAt      string `json:"createdAt"`
}

func Append(ctx context.Context, database *db.DB, orgID, actorID, action, category, resourceType, resourceID string, after any) error {
	appendMu.Lock()
	defer appendMu.Unlock()

	prev := "genesis"
	var prevAt time.Time
	err := database.QueryRow(ctx, `SELECT "eventHash","createdAt" FROM "AuditEvent" WHERE "organizationId"=? ORDER BY "createdAt" DESC LIMIT 1`, orgID).Scan(&prev, &prevAt)
	if errors.Is(err, sql.ErrNoRows) {
		prev = "genesis"
		prevAt = time.Time{}
	} else if err != nil {
		return err
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	if !prevAt.IsZero() && !now.After(prevAt.UTC().Truncate(time.Microsecond)) {
		now = prevAt.UTC().Truncate(time.Microsecond).Add(time.Millisecond)
	}
	eventID := id.New()
	created := formatAuditTime(now)
	afterJSON := ""
	var afterValue any
	if after != nil {
		raw, err := json.Marshal(after)
		if err != nil {
			return err
		}
		afterJSON = string(raw)
		afterValue = afterJSON
	}
	body, err := json.Marshal(canon{
		ID: eventID, OrganizationID: orgID, ActorID: actorID, Action: action,
		Category: categoryOr(category), ResourceType: resourceType, ResourceID: resourceID,
		AfterJSON: afterJSON, PreviousHash: prev, CreatedAt: created,
	})
	if err != nil {
		return err
	}
	sum, err := eventMAC(body)
	if err != nil {
		return err
	}
	var actor any
	if actorID != "" {
		actor = actorID
	}
	if _, err = database.Exec(ctx, `INSERT INTO "AuditEvent" ("id","organizationId","actorId","action","category","resourceType","resourceId","afterJson","previousHash","eventHash","createdAt","hashEpoch") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		eventID, orgID, actor, action, categoryOr(category), Empty(resourceType), Empty(resourceID), afterValue, prev, sum, now, epochHMAC); err != nil {
		return err
	}
	return writeTip(orgID, eventID, sum)
}

// Verify checks linkage for every row and recomputes the HMAC for epoch 1 rows.
func Verify(ctx context.Context, database *db.DB, orgID string) error {
	rows, err := database.Query(ctx, `SELECT "id","actorId","action","category","resourceType","resourceId","afterJson","previousHash","eventHash","createdAt","hashEpoch" FROM "AuditEvent" WHERE "organizationId"=? ORDER BY "createdAt" ASC, "id" ASC`, orgID)
	if err != nil {
		return err
	}
	defer rows.Close()
	prev := "genesis"
	for rows.Next() {
		var eventID, action, category, previous, hash string
		var actor, resourceType, resourceID, after sql.NullString
		var created time.Time
		var epoch int
		if err := rows.Scan(&eventID, &actor, &action, &category, &resourceType, &resourceID, &after, &previous, &hash, &created, &epoch); err != nil {
			return err
		}
		if previous != prev {
			return fmt.Errorf("audit chain break at %s", eventID)
		}
		if epoch >= epochHMAC {
			body, err := json.Marshal(canon{
				ID: eventID, OrganizationID: orgID, ActorID: actor.String, Action: action,
				Category: category, ResourceType: resourceType.String, ResourceID: resourceID.String,
				AfterJSON: after.String, PreviousHash: previous, CreatedAt: formatAuditTime(created),
			})
			if err != nil {
				return err
			}
			sum, err := eventMAC(body)
			if err != nil {
				return err
			}
			if sum != hash {
				return fmt.Errorf("audit hash mismatch at %s", eventID)
			}
		}
		prev = hash
	}
	return rows.Err()
}

func CheckTip(ctx context.Context, database *db.DB) error {
	tips, err := loadTips()
	if err != nil || len(tips) == 0 {
		return err
	}
	for orgID, line := range tips {
		mac, err := tipMAC(line.orgID, line.id, line.hash)
		if err != nil {
			return err
		}
		if !hmac.Equal([]byte(mac), []byte(line.mac)) {
			return fmt.Errorf("audit tip mac mismatch for %s", orgID)
		}
		var id, hash string
		err = database.QueryRow(ctx, `SELECT "id","eventHash" FROM "AuditEvent" WHERE "organizationId"=? ORDER BY "createdAt" DESC LIMIT 1`, orgID).Scan(&id, &hash)
		if err != nil || id != line.id || hash != line.hash {
			return fmt.Errorf("audit chain tip mismatch for %s", orgID)
		}
	}
	return nil
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

func formatAuditTime(t time.Time) string {
	return t.UTC().Truncate(time.Microsecond).Format(time.RFC3339Nano)
}

func derivedKey(info string) ([]byte, error) {
	secret := strings.TrimSpace(os.Getenv("AUTH_SECRET"))
	if len(secret) < 32 {
		return nil, errors.New("AUTH_SECRET must be at least 32 characters")
	}
	reader := hkdf.New(sha256.New, []byte(secret), nil, []byte(info))
	key := make([]byte, 32)
	if _, err := io.ReadFull(reader, key); err != nil {
		return nil, err
	}
	return key, nil
}

func eventMAC(body []byte) (string, error) {
	key, err := derivedKey(hmacInfo)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil)), nil
}

type tipLine struct {
	mac, orgID, id, hash string
}

func dataDir() string {
	if dir := strings.TrimSpace(os.Getenv("OTTERSCALE_DATA_DIR")); dir != "" {
		return dir
	}
	return "/data"
}

func tipPath() string {
	return filepath.Join(dataDir(), "audit.tip")
}

func tipMAC(orgID, eventID, eventHash string) (string, error) {
	key, err := derivedKey(tipInfo)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(orgID + "|" + eventID + "|" + eventHash))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func loadTips() (map[string]tipLine, error) {
	raw, err := os.ReadFile(tipPath())
	if errors.Is(err, os.ErrNotExist) {
		return map[string]tipLine{}, nil
	}
	if err != nil {
		return nil, err
	}
	tips := map[string]tipLine{}
	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		if len(fields) != 4 {
			return nil, errors.New("audit tip is malformed")
		}
		tips[fields[1]] = tipLine{mac: fields[0], orgID: fields[1], id: fields[2], hash: fields[3]}
	}
	return tips, nil
}

func writeTip(orgID, eventID, eventHash string) error {
	if err := os.MkdirAll(dataDir(), 0o700); err != nil {
		return err
	}
	mac, err := tipMAC(orgID, eventID, eventHash)
	if err != nil {
		return err
	}
	tips, err := loadTips()
	if err != nil {
		return err
	}
	tips[orgID] = tipLine{mac: mac, orgID: orgID, id: eventID, hash: eventHash}
	var b strings.Builder
	for _, line := range tips {
		fmt.Fprintf(&b, "%s %s %s %s\n", line.mac, line.orgID, line.id, line.hash)
	}
	return os.WriteFile(tipPath(), []byte(b.String()), 0o600)
}
