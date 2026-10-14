package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func (a *API) live(w http.ResponseWriter, r *http.Request) {
	userID, err := a.userID(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	authz, err := a.Store.LoadCapabilities(r.Context(), userID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	send := func(event string, payload any) {
		raw, err := json.Marshal(payload)
		if err != nil {
			return
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, raw)
		flusher.Flush()
	}
	push := func(topic string) {
		switch topic {
		case "machines":
			table, err := a.machineSnapshot(r.Context(), authz)
			if err == nil {
				send("machines", table)
			}
		case "workspaces":
			if has(authz.Capabilities, "workspace.manage") {
				rows, err := a.Store.Workspaces(r.Context())
				if err == nil {
					send("workspaces", rows)
				}
			}
		case "users":
			if !has(authz.Capabilities, "members.view") {
				return
			}
			rows, err := a.Store.Users(r.Context())
			if err != nil {
				return
			}
			var invites any = []struct{}{}
			if has(authz.Capabilities, "members.invite") {
				pending, err := a.Store.PendingInvites(r.Context())
				if err != nil {
					return
				}
				invites = pending
			}
			send("users", map[string]any{"users": rows, "invites": invites})
		}
	}
	stop := a.Live.Subscribe(func(topic string) { push(topic) })
	defer stop()
	push("machines")
	if has(authz.Capabilities, "workspace.manage") {
		push("workspaces")
	}
	if has(authz.Capabilities, "members.view") {
		push("users")
	}
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}
