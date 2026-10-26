package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"strings"
	"time"

	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
)

// mintEnrollment stores a one-time enrollment bound to the user who created the auth key.
// The returned secret is shown once and is not stored.
func (a *API) mintEnrollment(ctx context.Context, orgID, userID string, expires time.Time) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	secret := hex.EncodeToString(buf)
	now := time.Now().UTC()
	_, err := a.Store.DB.Exec(ctx, `INSERT INTO "DeviceEnrollment" ("id","organizationId","userId","tokenHash","expiresAt","createdAt") VALUES (?,?,?,?,?,?)`,
		id.New(), orgID, userID, secretHash(secret), expires.UTC(), now)
	if err != nil {
		return "", err
	}
	return secret, nil
}

// pendingEnrollment returns the user who may enroll this computer.
// A console link wins. Otherwise the secret is a stored Add-machine enrollment.
func (a *API) pendingEnrollment(ctx context.Context, raw string, now time.Time) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errLinkGone
	}
	userID, err := a.linkBook().enrollmentOwner(raw, now)
	if err == nil {
		return userID, nil
	}
	if err != errLinkGone {
		return "", err
	}
	return a.lookupDeviceEnrollment(ctx, raw, now)
}

func (a *API) finishEnrollment(ctx context.Context, raw string, now time.Time) error {
	raw = strings.TrimSpace(raw)
	err := a.linkBook().consumeEnrollment(raw, now)
	if err == nil {
		return nil
	}
	if err != errLinkGone {
		return err
	}
	return a.consumeStoredEnrollment(ctx, raw, now)
}

func (a *API) lookupDeviceEnrollment(ctx context.Context, raw string, now time.Time) (string, error) {
	var userID string
	var used, live int
	err := a.Store.DB.QueryRow(ctx, `SELECT "userId", CASE WHEN "usedAt" IS NULL THEN 0 ELSE 1 END, CASE WHEN "expiresAt" > ? THEN 1 ELSE 0 END FROM "DeviceEnrollment" WHERE "tokenHash"=?`, now.UTC(), secretHash(raw)).Scan(&userID, &used, &live)
	if err == sql.ErrNoRows {
		return "", errLinkGone
	}
	if err != nil {
		return "", err
	}
	if used == 1 {
		return "", errLinkUsed
	}
	if live == 0 {
		return "", errLinkGone
	}
	return userID, nil
}

func (a *API) consumeStoredEnrollment(ctx context.Context, raw string, now time.Time) error {
	now = now.UTC()
	res, err := a.Store.DB.Exec(ctx, `UPDATE "DeviceEnrollment" SET "usedAt"=? WHERE "tokenHash"=? AND "usedAt" IS NULL AND "expiresAt">?`, now, secretHash(raw), now)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 1 {
		return nil
	}
	_, err = a.lookupDeviceEnrollment(ctx, raw, now)
	if err == nil {
		return errLinkUsed
	}
	return err
}

// assignCreator records the enrolling user when the machine row has no owner yet.
func assignCreator(ctx context.Context, database *db.DB, machineID, userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" || machineID == "" {
		return nil
	}
	_, err := database.Exec(ctx, `UPDATE "Machine" SET "createdById"=?,"updatedAt"=? WHERE "id"=? AND ("createdById" IS NULL OR "createdById"='')`, userID, time.Now().UTC(), machineID)
	return err
}
