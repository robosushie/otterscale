package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"otterscale/core/internal/headscale"
	"otterscale/core/internal/machines"
	"otterscale/core/internal/store"
)

func (a *API) machines(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.view")
	if !ok {
		return
	}
	table, err := a.machineSnapshot(r.Context(), authz)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, table)
}

func (a *API) createKey(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.manage")
	if !ok {
		return
	}
	var body struct {
		WorkspaceIDs []string `json:"workspaceIds"`
		TagIDs       []string `json:"tagIds"`
		Expiry       string   `json:"expiry"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	client := headscale.FromEnv()
	if client == nil {
		fail(w, http.StatusServiceUnavailable, "Headscale is not configured")
		return
	}
	org, _ := a.Store.DefaultOrg(r.Context())
	tags := []string{}
	for _, gid := range body.WorkspaceIDs {
		var name string
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT "name" FROM "Group" WHERE "id"=?`, gid).Scan(&name); err == nil {
			tags = append(tags, machines.WorkspaceTagName(name))
		}
	}
	for _, tid := range body.TagIDs {
		var acl string
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT "aclTag" FROM "Tag" WHERE "id"=?`, tid).Scan(&acl); err == nil {
			tags = append(tags, acl)
		}
	}
	exp := parseExpiry(body.Expiry, time.Now())
	key, err := client.CreatePreAuthKey(r.Context(), "tagged-devices", exp, tags)
	if err != nil {
		fail(w, http.StatusBadGateway, headscale.FormatError(err))
		return
	}
	_ = a.Store.Audit(r.Context(), org.ID, authz.UserID, "authkey.created", "NETWORK", "preauthkey", "", map[string]any{"tags": tags})
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]string{"key": key, "loginServer": loginServer()})
}

func (a *API) expireKey(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "network.manage"); !ok {
		return
	}
	var body struct {
		Key string `json:"key"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	client := headscale.FromEnv()
	if client == nil {
		fail(w, http.StatusServiceUnavailable, "Headscale is not configured")
		return
	}
	if err := client.ExpirePreAuthKey(r.Context(), body.Key, "tagged-devices"); err != nil {
		fail(w, http.StatusBadGateway, headscale.FormatError(err))
		return
	}
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) updateMachine(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.manage")
	if !ok {
		return
	}
	if !a.addedMachine(w, r, authz.UserID) {
		return
	}
	var body struct {
		Name         string   `json:"name"`
		WorkspaceIDs []string `json:"workspaceIds"`
		TagIDs       []string `json:"tagIds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	var hsID, name string
	if err := a.Store.DB.QueryRow(r.Context(), `SELECT "headscaleNodeId","name" FROM "Machine" WHERE "id"=?`, r.PathValue("id")).Scan(&hsID, &name); err != nil {
		fail(w, http.StatusNotFound, "Machine not found")
		return
	}
	client := headscale.FromEnv()
	if body.Name != "" && body.Name != name && client != nil {
		if err := client.RenameNode(r.Context(), hsID, body.Name); err != nil {
			fail(w, http.StatusBadGateway, headscale.FormatError(err))
			return
		}
		_, _ = a.Store.DB.Exec(r.Context(), `UPDATE "Machine" SET "name"=?,"updatedAt"=? WHERE "id"=?`, body.Name, time.Now().UTC(), r.PathValue("id"))
	}
	_, _ = a.Store.DB.Exec(r.Context(), `DELETE FROM "MachineWorkspace" WHERE "machineId"=?`, r.PathValue("id"))
	_, _ = a.Store.DB.Exec(r.Context(), `DELETE FROM "MachineTag" WHERE "machineId"=?`, r.PathValue("id"))
	acl := []string{}
	for _, gid := range body.WorkspaceIDs {
		_, _ = a.Store.DB.Exec(r.Context(), `INSERT INTO "MachineWorkspace" ("machineId","groupId") VALUES (?,?)`, r.PathValue("id"), gid)
		var gname string
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT "name" FROM "Group" WHERE "id"=?`, gid).Scan(&gname); err == nil {
			acl = append(acl, machines.WorkspaceTagName(gname))
		}
	}
	for _, tid := range body.TagIDs {
		_, _ = a.Store.DB.Exec(r.Context(), `INSERT INTO "MachineTag" ("machineId","tagId") VALUES (?,?)`, r.PathValue("id"), tid)
		var tag string
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT "aclTag" FROM "Tag" WHERE "id"=?`, tid).Scan(&tag); err == nil {
			acl = append(acl, tag)
		}
	}
	if client != nil && len(acl) > 0 {
		_ = client.SetNodeTags(r.Context(), hsID, acl)
	}
	org, _ := a.Store.DefaultOrg(r.Context())
	_ = a.Store.Audit(r.Context(), org.ID, authz.UserID, "machine.updated", "NETWORK", "machine", r.PathValue("id"), map[string]any{"name": body.Name})
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteMachine(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.manage")
	if !ok {
		return
	}
	if !a.addedMachine(w, r, authz.UserID) {
		return
	}
	var hsID string
	if err := a.Store.DB.QueryRow(r.Context(), `SELECT "headscaleNodeId" FROM "Machine" WHERE "id"=?`, r.PathValue("id")).Scan(&hsID); err != nil {
		fail(w, http.StatusNotFound, "Machine not found")
		return
	}
	if client := headscale.FromEnv(); client != nil {
		if err := client.DeleteNode(r.Context(), hsID); err != nil {
			fail(w, http.StatusBadGateway, headscale.FormatError(err))
			return
		}
	}
	_, _ = a.Store.DB.Exec(r.Context(), `DELETE FROM "Machine" WHERE "id"=?`, r.PathValue("id"))
	org, _ := a.Store.DefaultOrg(r.Context())
	_ = a.Store.Audit(r.Context(), org.ID, authz.UserID, "machine.deleted", "NETWORK", "machine", r.PathValue("id"), nil)
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) addedMachine(w http.ResponseWriter, r *http.Request, actorID string) bool {
	var creator sql.NullString
	err := a.Store.DB.QueryRow(r.Context(), `SELECT "createdById" FROM "Machine" WHERE "id"=?`, r.PathValue("id")).Scan(&creator)
	if err != nil {
		fail(w, http.StatusNotFound, "Machine not found")
		return false
	}
	if !creator.Valid || creator.String != actorID {
		fail(w, http.StatusForbidden, "Only the person who added this machine can change it.")
		return false
	}
	return true
}

func (a *API) machineSnapshot(ctx context.Context, authz store.Capabilities) (store.MachinesTable, error) {
	org, err := a.Store.DefaultOrg(ctx)
	if err != nil {
		return store.MachinesTable{}, err
	}
	client := headscale.FromEnv()
	var nodes []headscale.Node
	hsErr := ""
	if client != nil {
		nodes, err = client.ListNodes(ctx)
		if err != nil {
			hsErr = headscale.FormatError(err)
			nodes = nil
		} else if err := a.Store.SyncMachines(ctx, org.ID, nodes); err != nil {
			hsErr = err.Error()
		}
		_ = a.Store.WriteAppRoutes(ctx, org)
	}
	return a.Store.MachinesTable(ctx, authz, nodes, hsErr, client != nil, loginServer())
}

func (a *API) watchHeadscale(ctx context.Context) bool {
	client := headscale.FromEnv()
	if client == nil {
		return false
	}
	nodes, err := client.ListNodes(ctx)
	if err != nil {
		return false
	}
	org, err := a.Store.DefaultOrg(ctx)
	if err != nil {
		return false
	}
	if err := a.Store.SyncMachines(ctx, org.ID, nodes); err != nil {
		return false
	}
	_ = a.Store.WriteAppRoutes(ctx, org)
	next := headscale.NodeFingerprint(nodes)
	if next == a.Live.Fingerprint {
		return false
	}
	a.Live.Fingerprint = next
	return true
}
