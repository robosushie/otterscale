package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/pquerna/otp/totp"
	"otterscale/core/internal/auth"
	"otterscale/core/internal/id"
	"otterscale/core/internal/store"
)

func (a *API) lookupInvite(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	invite, err := a.Store.FindInviteByCode(r.Context(), body.Code)
	if err != nil {
		fail(w, http.StatusBadRequest, "Invalid or expired invite.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"email": invite.Email, "username": invite.Username})
}

func (a *API) redeemInvite(w http.ResponseWriter, r *http.Request) {
	var body struct {
		InviteCode, Email, Username, Password, ConfirmPassword, TotpCode, TotpSecret string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	username := strings.TrimSpace(body.Username)
	if msg := validateUsername(username); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	if msg := auth.ValidatePassword(body.Password); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	if body.Password != body.ConfirmPassword {
		fail(w, http.StatusBadRequest, "Passwords do not match.")
		return
	}
	if body.TotpSecret == "" || body.TotpCode == "" || !totp.Validate(strings.ReplaceAll(body.TotpCode, " ", ""), body.TotpSecret) {
		fail(w, http.StatusBadRequest, "TOTP enrollment required.")
		return
	}
	invite, err := a.Store.FindInviteByCode(r.Context(), body.InviteCode)
	if err != nil {
		fail(w, http.StatusBadRequest, "Invalid or expired invite.")
		return
	}
	if invite.Email != email || !strings.EqualFold(invite.Username, username) {
		fail(w, http.StatusBadRequest, "Invite does not match this account.")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		fail(w, http.StatusInternalServerError, "Could not hash password")
		return
	}
	enc, err := auth.EncryptSecret(body.TotpSecret, a.Secret)
	if err != nil {
		fail(w, http.StatusInternalServerError, "Could not store authenticator")
		return
	}
	userID := id.New()
	now := time.Now().UTC()
	_, err = a.Store.DB.Exec(r.Context(), `INSERT INTO "User" ("id","username","email","passwordHash","totpSecret","totpEnabled","passwordChangedAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)`,
		userID, username, email, hash, enc, true, now, now, now)
	if err != nil {
		fail(w, http.StatusConflict, "Username or email already in use.")
		return
	}
	if err := a.Store.ApplyInvite(r.Context(), userID, email, invite); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.Live.Publish("users")
	a.setSession(w, r, userID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) createInvite(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "members.invite")
	if !ok {
		return
	}
	var body struct {
		Email        string   `json:"email"`
		Username     string   `json:"username"`
		Role         string   `json:"role"`
		WorkspaceIDs []string `json:"workspaceIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !strings.Contains(email, "@") {
		fail(w, http.StatusBadRequest, "Valid email required.")
		return
	}
	if msg := validateUsername(body.Username); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	var platform *string
	tenant := "MEMBER"
	switch strings.ToUpper(strings.TrimSpace(body.Role)) {
	case "", "MEMBER":
		tenant = "MEMBER"
	case "ADMIN":
		tenant = "ADMIN"
	case "SUPER_ADMIN":
		if !has(authz.Capabilities, "platform.manage_admins") {
			fail(w, http.StatusForbidden, "Only the owner can invite a Super admin.")
			return
		}
		role := "SUPER_ADMIN"
		platform = &role
		tenant = "ADMIN"
	default:
		fail(w, http.StatusBadRequest, "Invalid role.")
		return
	}
	code, inviteID, expires, err := a.Store.CreateInvite(r.Context(), authz.UserID, email, strings.TrimSpace(body.Username), tenant, platform, body.WorkspaceIDs)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("users")
	writeJSON(w, http.StatusOK, map[string]any{"code": code, "id": inviteID, "email": email, "expiresAt": expires, "acceptPath": "/accept-invite"})
}

func (a *API) revokeInvite(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "members.invite"); !ok {
		return
	}
	if err := a.Store.RevokeInvite(r.Context(), r.PathValue("id")); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("users")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) invites(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "members.invite"); !ok {
		return
	}
	rows, err := a.Store.PendingInvites(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) users(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "members.view"); !ok {
		return
	}
	rows, err := a.Store.Users(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) updateUser(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "members.invite")
	if !ok {
		return
	}
	userID := r.PathValue("id")
	if !a.canChangeUser(w, r, authz, userID) {
		return
	}
	var body struct {
		Role         string   `json:"role"`
		WorkspaceIDs []string `json:"workspaceIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	role := strings.ToUpper(strings.TrimSpace(body.Role))
	if role == "" {
		role = "MEMBER"
	}
	now := time.Now().UTC()
	switch role {
	case "SUPER_ADMIN":
		if !has(authz.Capabilities, "platform.manage_admins") {
			fail(w, http.StatusForbidden, "Only the owner can assign a Super admin.")
			return
		}
		var existing string
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT "id" FROM "PlatformMembership" WHERE "userId"=? AND "role"='SUPER_ADMIN'`, userID).Scan(&existing); err != nil {
			if _, err := a.Store.DB.Exec(r.Context(), `INSERT INTO "PlatformMembership" ("id","userId","role","createdAt") VALUES (?,?,?,?)`, id.New(), userID, "SUPER_ADMIN", now); err != nil {
				fail(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		a.setTenantRole(r, userID, "ADMIN", now)
	case "ADMIN", "MEMBER":
		if a.platformRole(r, userID) == "SUPER_ADMIN" && !has(authz.Capabilities, "platform.manage_admins") {
			fail(w, http.StatusForbidden, "Only the owner can change a Super admin.")
			return
		}
		if has(authz.Capabilities, "platform.manage_admins") {
			_, _ = a.Store.DB.Exec(r.Context(), `DELETE FROM "PlatformMembership" WHERE "userId"=? AND "role"='SUPER_ADMIN'`, userID)
		}
		a.setTenantRole(r, userID, role, now)
	default:
		fail(w, http.StatusBadRequest, "Invalid role.")
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "WorkspaceMembership" WHERE "userId"=?`, userID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, groupID := range body.WorkspaceIDs {
		groupID = strings.TrimSpace(groupID)
		if groupID == "" {
			continue
		}
		if _, err := a.Store.DB.Exec(r.Context(), `INSERT INTO "WorkspaceMembership" ("id","userId","groupId","role","createdAt") VALUES (?,?,?,?,?)`, id.New(), userID, groupID, "MEMBER", now); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	a.Live.Publish("users")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) setUserDisabled(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "members.invite")
	if !ok {
		return
	}
	userID := r.PathValue("id")
	if !a.canChangeUser(w, r, authz, userID) {
		return
	}
	var body struct {
		Disabled bool `json:"disabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `UPDATE "User" SET "loginDisabled"=?,"updatedAt"=? WHERE "id"=?`, body.Disabled, time.Now().UTC(), userID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if body.Disabled {
		_ = a.Store.DeleteUserSessions(r.Context(), userID)
	}
	a.Live.Publish("users")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteUser(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "members.invite")
	if !ok {
		return
	}
	userID := r.PathValue("id")
	if !a.canChangeUser(w, r, authz, userID) {
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "User" WHERE "id"=?`, userID); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("users")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) updateInvite(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "members.invite"); !ok {
		return
	}
	var body struct {
		WorkspaceIDs []string `json:"workspaceIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	if err := a.Store.ReplaceInviteWorkspaces(r.Context(), r.PathValue("id"), body.WorkspaceIDs); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("users")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) canChangeUser(w http.ResponseWriter, r *http.Request, authz store.Capabilities, userID string) bool {
	if userID == "" || userID == authz.UserID {
		fail(w, http.StatusBadRequest, "You cannot change your own account here.")
		return false
	}
	role := a.platformRole(r, userID)
	if role == "OWNER" {
		fail(w, http.StatusForbidden, "The owner account cannot be changed here.")
		return false
	}
	if role == "SUPER_ADMIN" && !has(authz.Capabilities, "platform.manage_admins") {
		fail(w, http.StatusForbidden, "Only the owner can change a Super admin.")
		return false
	}
	return true
}

func (a *API) platformRole(r *http.Request, userID string) string {
	var role string
	_ = a.Store.DB.QueryRow(r.Context(), `SELECT "role" FROM "PlatformMembership" WHERE "userId"=? AND "role" IN ('OWNER','SUPER_ADMIN') ORDER BY CASE "role" WHEN 'OWNER' THEN 0 ELSE 1 END LIMIT 1`, userID).Scan(&role)
	return role
}

func (a *API) setTenantRole(r *http.Request, userID, role string, now time.Time) {
	res, err := a.Store.DB.Exec(r.Context(), `UPDATE "TenantMembership" SET "role"=? WHERE "userId"=?`, role, userID)
	if err != nil {
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, _ = a.Store.DB.Exec(r.Context(), `INSERT INTO "TenantMembership" ("id","userId","role","createdAt") VALUES (?,?,?,?)`, id.New(), userID, role, now)
	}
}
