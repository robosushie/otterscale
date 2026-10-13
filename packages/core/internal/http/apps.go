package httpapi

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
)

func (a *API) apps(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "network.view"); !ok {
		return
	}
	rows, err := a.Store.Apps(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) publishApp(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.manage")
	if !ok {
		return
	}
	var body struct {
		AppID, MachineID, Subdomain string
		Port                        int
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	sub := strings.ToLower(strings.Trim(regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(strings.ToLower(body.Subdomain), "-"), "-"))
	if body.MachineID == "" || body.Port < 1 || body.Port > 65535 || sub == "" {
		fail(w, http.StatusBadRequest, "Machine, port, and subdomain are required")
		return
	}
	if err := a.Store.UpsertApp(r.Context(), authz.UserID, body.AppID, body.MachineID, sub, body.Port, "ACTIVE", ""); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ACTIVE"})
}

func (a *API) deleteApp(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.manage")
	if !ok {
		return
	}
	if err := a.Store.DeleteApp(r.Context(), authz.UserID, r.PathValue("id")); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
