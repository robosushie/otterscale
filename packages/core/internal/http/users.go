package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/pquerna/otp/totp"
	"otterscale/core/internal/auth"
	"otterscale/core/internal/id"
)

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
