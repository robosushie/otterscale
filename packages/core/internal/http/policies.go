package httpapi

import (
	"encoding/json"
	"net/http"

	"otterscale/core/internal/headscale"
	"otterscale/core/internal/policy"
)

func (a *API) createRule(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "workspace.policy")
	if !ok {
		return
	}
	var body struct {
		GroupID string `json:"groupId"`
		TagID   string `json:"tagId"`
		Ports   string `json:"ports"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := a.Store.CreateAccessRule(r.Context(), authz.UserID, body.GroupID, body.TagID, body.Ports); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) policies(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "workspace.policy"); !ok {
		return
	}
	rows, err := a.Store.Policies(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) applyPolicy(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "workspace.policy")
	if !ok {
		return
	}
	org, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	input, err := a.Store.CompileInput(r.Context(), org.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	compiled := policy.CompilePolicy(input)
	status := "APPLIED"
	msg := ""
	if client := headscale.FromEnv(); client != nil {
		if err := client.PutPolicy(r.Context(), compiled.HuJSON); err != nil {
			status = "FAILED"
			msg = headscale.FormatError(err)
		}
	}
	if _, err := a.Store.SavePolicy(r.Context(), org.ID, authz.UserID, compiled, status, msg); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.Live.Publish("machines")
	if status == "FAILED" {
		fail(w, http.StatusBadGateway, msg)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "hujson": compiled.HuJSON})
}
