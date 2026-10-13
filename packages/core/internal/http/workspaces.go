package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (a *API) workspaces(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "workspace.manage"); !ok {
		return
	}
	rows, err := a.Store.Workspaces(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) createWorkspace(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "workspace.manage")
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.Name) == "" {
		fail(w, http.StatusBadRequest, "Name required")
		return
	}
	if err := a.Store.CreateWorkspace(r.Context(), authz.UserID, body.Name); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("workspaces")
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) addMember(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "workspace.manage")
	if !ok {
		return
	}
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !strings.Contains(body.Email, "@") {
		fail(w, http.StatusBadRequest, "Valid email required.")
		return
	}
	if err := a.Store.AddWorkspaceMember(r.Context(), authz.UserID, r.PathValue("id"), body.Email, body.Role); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("workspaces")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
