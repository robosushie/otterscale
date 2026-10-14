package httpapi

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
)

func (a *API) apps(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.view")
	if !ok {
		return
	}
	rows, err := a.Store.Apps(r.Context(), authz)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) publishApp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AppID, MachineID, Subdomain string
		Port                        int
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	capability := "network.manage"
	if body.AppID != "" {
		capability = "network.view"
	}
	authz, ok := a.require(w, r, capability)
	if !ok {
		return
	}
	sub := strings.ToLower(strings.Trim(regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(strings.ToLower(body.Subdomain), "-"), "-"))
	if body.MachineID == "" || body.Port < 1 || body.Port > 65535 || sub == "" {
		fail(w, http.StatusBadRequest, "Machine, port, and subdomain are required")
		return
	}
	status := "ACTIVE"
	if body.AppID != "" {
		_ = a.Store.DB.QueryRow(r.Context(), `SELECT "status" FROM "PublishedApp" WHERE "id"=?`, body.AppID).Scan(&status)
		if status == "" {
			status = "ACTIVE"
		}
	}
	if err := a.Store.UpsertApp(r.Context(), authz.UserID, body.AppID, body.MachineID, sub, body.Port, status, "", steward(authz)); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

func (a *API) setAppDisabled(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.view")
	if !ok {
		return
	}
	var body struct {
		Disabled bool `json:"disabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	status := "ACTIVE"
	if body.Disabled {
		status = "DISABLED"
	}
	if err := a.Store.SetAppStatus(r.Context(), authz.UserID, r.PathValue("id"), status, steward(authz)); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteApp(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.view")
	if !ok {
		return
	}
	if err := a.Store.DeleteApp(r.Context(), authz.UserID, r.PathValue("id"), steward(authz)); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
