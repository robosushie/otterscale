package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/pquerna/otp/totp"
	"otterscale/core/internal/auth"
	"otterscale/core/internal/id"
	"otterscale/core/internal/store"
)

func (a *API) session(w http.ResponseWriter, r *http.Request) {
	has, _ := a.Store.HasOwner(r.Context())
	methods := map[string]any{"local": true, "oidc": oidcEnabled(), "hasOwner": has}
	userID, err := a.userID(r)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"user": nil, "methods": methods})
		return
	}
	caps, err := a.Store.LoadCapabilities(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"user": nil, "methods": methods})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": caps, "methods": methods})
}

func (a *API) totpURI(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	if msg := validateUsername(body.Username); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	key, err := totp.Generate(totp.GenerateOpts{Issuer: "Otterscale", AccountName: body.Username, SecretSize: 20})
	if err != nil {
		fail(w, http.StatusInternalServerError, "Could not create authenticator secret")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"secret": key.Secret(), "uri": key.URL()})
}

func (a *API) setup(w http.ResponseWriter, r *http.Request) {
	has, err := a.Store.HasOwner(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if has {
		fail(w, http.StatusConflict, "Setup already complete.")
		return
	}
	var body struct {
		Username, Email, Password, ConfirmPassword, TotpCode, TotpSecret, SetupToken string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	if token := strings.TrimSpace(os.Getenv("AUTH_SETUP_TOKEN")); token != "" && body.SetupToken != token {
		fail(w, http.StatusForbidden, "Invalid setup token.")
		return
	}
	if msg := validateUsername(body.Username); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !strings.Contains(email, "@") {
		fail(w, http.StatusBadRequest, "Valid email required.")
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
	if _, err := a.Store.FindUser(r.Context(), body.Username); err == nil {
		fail(w, http.StatusConflict, "Username or email already in use.")
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
		userID, strings.TrimSpace(body.Username), email, hash, enc, true, now, now, now)
	if err != nil {
		fail(w, http.StatusConflict, "Username or email already in use.")
		return
	}
	if err := a.Store.BootstrapOwner(r.Context(), userID, email); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.setSession(w, r, userID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) signin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username, Password, TotpCode string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	user, err := a.Store.FindUser(r.Context(), body.Username)
	if err != nil || !user.PasswordHash.Valid || !auth.VerifyPassword(body.Password, user.PasswordHash.String) {
		fail(w, http.StatusUnauthorized, "Invalid username, password, or authenticator code.")
		return
	}
	if user.TotpEnabled {
		if strings.TrimSpace(body.TotpCode) == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "", "totpRequired": true})
			return
		}
		plain, err := auth.DecryptSecret(user.TotpSecret.String, a.Secret)
		if err != nil || !totp.Validate(strings.ReplaceAll(body.TotpCode, " ", ""), plain) {
			fail(w, http.StatusUnauthorized, "Invalid username, password, or authenticator code.")
			return
		}
	}
	a.setSession(w, r, user.ID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) signout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("otterscale_session"); err == nil {
		_ = a.Store.DeleteSession(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: "otterscale_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) capabilities(w http.ResponseWriter, r *http.Request) {
	userID, err := a.userID(r)
	if err != nil {
		fail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	caps, err := a.Store.LoadCapabilities(r.Context(), userID)
	if err != nil {
		fail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, caps)
}

func (a *API) require(w http.ResponseWriter, r *http.Request, cap string) (store.Capabilities, bool) {
	userID, err := a.userID(r)
	if err != nil {
		fail(w, http.StatusUnauthorized, "Unauthorized")
		return store.Capabilities{}, false
	}
	authz, err := a.Store.LoadCapabilities(r.Context(), userID)
	if err != nil || !has(authz.Capabilities, cap) {
		fail(w, http.StatusForbidden, "Forbidden")
		return store.Capabilities{}, false
	}
	return authz, true
}

func (a *API) userID(r *http.Request) (string, error) {
	c, err := r.Cookie("otterscale_session")
	if err != nil || c.Value == "" {
		return "", sql.ErrNoRows
	}
	return a.Store.UserIDForSession(r.Context(), c.Value)
}

func (a *API) setSession(w http.ResponseWriter, r *http.Request, userID string) {
	token, err := a.Store.CreateSession(r.Context(), userID)
	if err != nil {
		return
	}
	secure := strings.HasPrefix(strings.ToLower(os.Getenv("AUTH_URL")), "https://")
	http.SetCookie(w, &http.Cookie{
		Name: "otterscale_session", Value: token, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: 14 * 24 * 3600,
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func has(caps []string, want string) bool {
	for _, c := range caps {
		if c == want {
			return true
		}
	}
	return false
}

func oidcEnabled() bool {
	return os.Getenv("AUTH_OIDC_ISSUER") != "" && os.Getenv("AUTH_OIDC_CLIENT_ID") != "" && os.Getenv("AUTH_OIDC_CLIENT_SECRET") != ""
}

var usernameRE = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$`)

func validateUsername(username string) string {
	if !usernameRE.MatchString(strings.TrimSpace(username)) {
		return "Username must be 3–32 characters: letters, numbers, . _ -"
	}
	return ""
}
