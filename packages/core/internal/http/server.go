package httpapi

import (
	"net/http"
	"os"
	"strings"
	"time"

	"otterscale/core/internal/live"
	"otterscale/core/internal/store"
)

type API struct {
	Store  *store.Store
	Secret string
	Live   *live.Hub
}

func New(st *store.Store, secret string) *API {
	api := &API{Store: st, Secret: secret, Live: live.NewHub()}
	api.Live.Sync = api.watchHeadscale
	return api
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	})
	mux.HandleFunc("GET /api/auth/session", a.session)
	mux.HandleFunc("POST /api/auth/setup", a.setup)
	mux.HandleFunc("POST /api/auth/totp", a.totpURI)
	mux.HandleFunc("POST /api/auth/signin", a.signin)
	mux.HandleFunc("POST /api/auth/signout", a.signout)
	mux.HandleFunc("POST /api/auth/redeem", a.redeemInvite)
	mux.HandleFunc("GET /api/auth/oidc/start", a.oidcStart)
	mux.HandleFunc("GET /api/auth/oidc/callback", a.oidcCallback)
	mux.HandleFunc("GET /api/me/capabilities", a.capabilities)
	mux.HandleFunc("GET /api/live", a.live)
	mux.HandleFunc("GET /api/machines", a.machines)
	mux.HandleFunc("POST /api/machines/keys", a.createKey)
	mux.HandleFunc("POST /api/machines/keys/expire", a.expireKey)
	mux.HandleFunc("PATCH /api/machines/{id}", a.updateMachine)
	mux.HandleFunc("DELETE /api/machines/{id}", a.deleteMachine)
	mux.HandleFunc("GET /api/workspaces", a.workspaces)
	mux.HandleFunc("POST /api/workspaces", a.createWorkspace)
	mux.HandleFunc("POST /api/workspaces/{id}/members", a.addMember)
	mux.HandleFunc("GET /api/tags", a.tags)
	mux.HandleFunc("POST /api/tags", a.createTag)
	mux.HandleFunc("POST /api/access-rules", a.createRule)
	mux.HandleFunc("GET /api/policies", a.policies)
	mux.HandleFunc("POST /api/policies/apply", a.applyPolicy)
	mux.HandleFunc("GET /api/apps", a.apps)
	mux.HandleFunc("POST /api/apps", a.publishApp)
	mux.HandleFunc("DELETE /api/apps/{id}", a.deleteApp)
	mux.HandleFunc("GET /api/users", a.users)
	mux.HandleFunc("POST /api/users/invites", a.createInvite)
	mux.HandleFunc("POST /api/users/invites/{id}/revoke", a.revokeInvite)
	mux.HandleFunc("GET /api/audit", a.audit)
	mux.HandleFunc("GET /api/audit/export", a.auditExport)
	mux.HandleFunc("GET /api/v1/audit/export", a.auditExport)
	mux.HandleFunc("GET /api/settings", a.settings)
	mux.HandleFunc("PATCH /api/settings", a.updateSettings)
	return mux
}

func loginServer() string {
	raw := strings.TrimSpace(os.Getenv("OTTERSCALE_DOMAIN"))
	if raw == "" {
		return "http://127.0.0.1:8080"
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return strings.TrimRight(raw, "/")
	}
	return "https://" + strings.TrimRight(raw, "/")
}

func parseExpiry(raw string, from time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	hours := 24
	switch strings.ToLower(raw) {
	case "", "24 hours", "24h":
		hours = 24
	case "1 hour", "1h":
		hours = 1
	case "7 days", "7d":
		hours = 24 * 7
	case "90 days", "90d":
		hours = 24 * 90
	default:
		if t, err := time.Parse(time.RFC3339, raw); err == nil && t.After(from) {
			return t
		}
	}
	return from.Add(time.Duration(hours) * time.Hour)
}
