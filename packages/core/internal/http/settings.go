package httpapi

import (
	"encoding/json"
	"net/http"
)

func (a *API) settings(w http.ResponseWriter, r *http.Request) {
	userID, err := a.userID(r)
	if err != nil {
		fail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	authz, err := a.Store.LoadCapabilities(r.Context(), userID)
	if err != nil || (!has(authz.Capabilities, "platform.view") && !has(authz.Capabilities, "network.manage")) {
		fail(w, http.StatusForbidden, "Forbidden")
		return
	}
	org, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, org)
}

func (a *API) updateSettings(w http.ResponseWriter, r *http.Request) {
	userID, err := a.userID(r)
	if err != nil {
		fail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	authz, err := a.Store.LoadCapabilities(r.Context(), userID)
	if err != nil {
		fail(w, http.StatusForbidden, "Forbidden")
		return
	}
	var body struct {
		Name        string `json:"name"`
		AppsDomain  string `json:"appsBaseDomain"`
		ExpiryHours int    `json:"defaultAuthKeyExpiryHours"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.ExpiryHours != 0 && body.ExpiryHours < 1 {
		fail(w, http.StatusBadRequest, "Expiry hours must be at least 1")
		return
	}
	if (body.Name != "" || body.AppsDomain != "") && !has(authz.Capabilities, "platform.settings") {
		fail(w, http.StatusForbidden, "Forbidden")
		return
	}
	if body.ExpiryHours > 0 && body.Name == "" && body.AppsDomain == "" && !has(authz.Capabilities, "network.manage") && !has(authz.Capabilities, "platform.settings") {
		fail(w, http.StatusForbidden, "Forbidden")
		return
	}
	if err := a.Store.UpdateOrg(r.Context(), body.Name, body.AppsDomain, body.ExpiryHours); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
