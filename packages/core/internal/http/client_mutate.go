package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"otterscale/core/internal/apps"
	"otterscale/core/internal/headscale"
	"otterscale/core/internal/machines"
)

func (a *API) createClientKey(w http.ResponseWriter, r *http.Request) {
	_, orgID, userID, ok := a.deviceActor(w, r)
	if !ok {
		return
	}
	var body struct {
		WorkspaceIDs []string `json:"workspaceIds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if len(body.WorkspaceIDs) == 0 {
		fail(w, http.StatusBadRequest, "Choose a workspace")
		return
	}
	if !a.memberWorkspaces(w, r, userID, body.WorkspaceIDs) {
		return
	}
	client := headscale.FromEnv()
	if client == nil {
		fail(w, http.StatusServiceUnavailable, "Headscale is not configured")
		return
	}
	tags := a.aclTags(r.Context(), body.WorkspaceIDs, nil)
	exp := parseExpiry("24 hours", time.Now())
	key, err := client.CreatePreAuthKey(r.Context(), "tagged-devices", exp, tags)
	if err != nil {
		fail(w, http.StatusBadGateway, headscale.FormatError(err))
		return
	}
	enrollment, err := a.mintEnrollment(r.Context(), orgID, userID, exp)
	if err != nil {
		_ = client.ExpirePreAuthKey(r.Context(), key, "tagged-devices")
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), orgID, userID, "authkey.created", "NETWORK", "preauthkey", "", map[string]any{"tags": tags})
	a.Live.Publish("machines")
	ends := bootstrapEndpoints()
	writeJSON(w, http.StatusOK, map[string]string{
		"key": key, "loginServer": loginServer(), "enrollment": enrollment, "apiUrl": ends.APIURL,
	})
}

func (a *API) updateClientMachine(w http.ResponseWriter, r *http.Request) {
	_, orgID, userID, ok := a.deviceActor(w, r)
	if !ok {
		return
	}
	var body struct {
		Name         string   `json:"name"`
		WorkspaceIDs []string `json:"workspaceIds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !a.memberWorkspaces(w, r, userID, body.WorkspaceIDs) {
		return
	}
	machineID := r.PathValue("id")
	var hsID, name, creator string
	err := a.Store.DB.QueryRow(r.Context(), `SELECT "headscaleNodeId", "name", COALESCE("createdById",'') FROM "Machine" WHERE "id"=?`, machineID).Scan(&hsID, &name, &creator)
	if err != nil || creator != userID {
		if err != nil {
			fail(w, http.StatusNotFound, "Machine not found")
			return
		}
		fail(w, http.StatusForbidden, "Only the person who added this machine can change it.")
		return
	}
	client := headscale.FromEnv()
	next := strings.TrimSpace(body.Name)
	if next != "" && next != name && client != nil {
		if err := client.RenameNode(r.Context(), hsID, next); err != nil {
			fail(w, http.StatusBadGateway, headscale.FormatError(err))
			return
		}
		name = next
		_, _ = a.Store.DB.Exec(r.Context(), `UPDATE "Machine" SET "name"=?,"updatedAt"=? WHERE "id"=?`, name, time.Now().UTC(), machineID)
	}
	_, _ = a.Store.DB.Exec(r.Context(), `DELETE FROM "MachineWorkspace" WHERE "machineId"=?`, machineID)
	acl := a.machineTagACL(r, machineID)
	for _, gid := range body.WorkspaceIDs {
		_, _ = a.Store.DB.Exec(r.Context(), `INSERT INTO "MachineWorkspace" ("machineId","groupId") VALUES (?,?)`, machineID, gid)
		var gname string
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT "name" FROM "Group" WHERE "id"=?`, gid).Scan(&gname); err == nil {
			acl = append(acl, machines.WorkspaceTagName(gname))
		}
	}
	if client != nil && hsID != "" && len(acl) > 0 {
		_ = client.SetNodeTags(r.Context(), hsID, acl)
	}
	_ = a.Store.Audit(r.Context(), orgID, userID, "machine.updated", "NETWORK", "machine", machineID, map[string]any{"name": name})
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteClientMachine(w http.ResponseWriter, r *http.Request) {
	_, orgID, userID, ok := a.deviceActor(w, r)
	if !ok {
		return
	}
	machineID := r.PathValue("id")
	var hsID, creator string
	err := a.Store.DB.QueryRow(r.Context(), `SELECT "headscaleNodeId", COALESCE("createdById",'') FROM "Machine" WHERE "id"=?`, machineID).Scan(&hsID, &creator)
	if err != nil || creator != userID {
		if err != nil {
			fail(w, http.StatusNotFound, "Machine not found")
			return
		}
		fail(w, http.StatusForbidden, "Only the person who added this machine can change it.")
		return
	}
	if client := headscale.FromEnv(); client != nil && hsID != "" {
		if err := client.RemoveNode(r.Context(), hsID); err != nil {
			fail(w, http.StatusBadGateway, headscale.FormatError(err))
			return
		}
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "Machine" WHERE "id"=?`, machineID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), orgID, userID, "machine.deleted", "NETWORK", "machine", machineID, nil)
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) saveClientApp(w http.ResponseWriter, r *http.Request) {
	_, _, userID, ok := a.deviceActor(w, r)
	if !ok {
		return
	}
	var body struct {
		MachineID string `json:"machineId"`
		Subdomain string `json:"subdomain"`
		Port      int    `json:"port"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	sub := apps.CleanSubdomain(body.Subdomain)
	if body.MachineID == "" || body.Port < 1 || body.Port > 65535 || sub == "" {
		fail(w, http.StatusBadRequest, "Machine, port, and subdomain are required")
		return
	}
	if err := a.validateSubdomain(r, sub); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if !a.machineOwned(w, r, body.MachineID, userID) {
		return
	}
	appID := ""
	status := "ACTIVE"
	if r.PathValue("id") != "" {
		appID = r.PathValue("id")
		var creator string
		err := a.Store.DB.QueryRow(r.Context(), `SELECT COALESCE("createdById",''), "status" FROM "PublishedApp" WHERE "id"=?`, appID).Scan(&creator, &status)
		if err != nil || creator != userID {
			if err != nil {
				fail(w, http.StatusNotFound, "App not found")
				return
			}
			fail(w, http.StatusForbidden, "Only the person who added this app can change it.")
			return
		}
		if status == "" {
			status = "ACTIVE"
		}
	}
	if err := a.Store.UpsertApp(r.Context(), userID, appID, body.MachineID, sub, body.Port, status, "", false); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

func (a *API) deleteClientApp(w http.ResponseWriter, r *http.Request) {
	_, _, userID, ok := a.deviceActor(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteApp(r.Context(), userID, r.PathValue("id"), false); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.Live.Publish("apps")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deviceActor(w http.ResponseWriter, r *http.Request) (machineID, orgID, userID string, ok bool) {
	token := bearerToken(r)
	if token == "" {
		fail(w, http.StatusUnauthorized, "missing device token")
		return "", "", "", false
	}
	var creator string
	err := a.Store.DB.QueryRow(r.Context(), `SELECT m."id", m."organizationId", COALESCE(m."createdById",'') FROM "DeviceCredential" d JOIN "Machine" m ON m."id"=d."machineId" WHERE d."tokenHash"=?`, secretHash(token)).Scan(&machineID, &orgID, &creator)
	if err != nil {
		fail(w, http.StatusUnauthorized, "this computer was removed")
		return "", "", "", false
	}
	if creator == "" {
		fail(w, http.StatusForbidden, "this computer is not linked to a user")
		return "", "", "", false
	}
	return machineID, orgID, creator, true
}

func (a *API) memberWorkspaces(w http.ResponseWriter, r *http.Request, userID string, ids []string) bool {
	for _, id := range ids {
		var n int
		if err := a.Store.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM "WorkspaceMembership" WHERE "userId"=? AND "groupId"=?`, userID, id).Scan(&n); err != nil || n == 0 {
			fail(w, http.StatusForbidden, "That workspace is not one you belong to.")
			return false
		}
	}
	return true
}

func (a *API) machineOwned(w http.ResponseWriter, r *http.Request, machineID, userID string) bool {
	var creator string
	err := a.Store.DB.QueryRow(r.Context(), `SELECT COALESCE("createdById",'') FROM "Machine" WHERE "id"=?`, machineID).Scan(&creator)
	if err != nil {
		fail(w, http.StatusNotFound, "Machine not found")
		return false
	}
	if creator != userID {
		fail(w, http.StatusForbidden, "Only the person who added this machine can change it.")
		return false
	}
	return true
}

func (a *API) machineTagACL(r *http.Request, machineID string) []string {
	rows, err := a.Store.DB.Query(r.Context(), `SELECT t."aclTag" FROM "MachineTag" mt JOIN "Tag" t ON t."id"=mt."tagId" WHERE mt."machineId"=?`, machineID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			continue
		}
		if tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func (a *API) validateSubdomain(r *http.Request, sub string) error {
	organisation, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		return err
	}
	return apps.ValidateSubdomain(sub, organisation.AppsBaseDomain, apps.ConsoleHost())
}
