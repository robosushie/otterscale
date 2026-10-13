package httpapi

import (
	"encoding/json"
	"net/http"
)

func (a *API) tags(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "workspace.manage"); !ok {
		return
	}
	org, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	tags, err := a.Store.Tags(r.Context(), org.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tags)
}

func (a *API) createTag(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "workspace.manage")
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := a.Store.CreateTag(r.Context(), authz.UserID, body.Name); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
