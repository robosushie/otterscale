package httpapi

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"otterscale/core/internal/headscale"
	"otterscale/core/internal/id"
)

func (a *API) enrollDevice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enrollment string   `json:"enrollment"`
		Addresses  []string `json:"addresses"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	now := time.Now()
	userID, err := a.pendingEnrollment(r.Context(), body.Enrollment, now)
	if err != nil {
		if _, ok := err.(linkError); ok {
			fail(w, http.StatusGone, err.Error())
			return
		}
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	client := headscale.FromEnv()
	if client == nil {
		fail(w, http.StatusServiceUnavailable, "Headscale is not configured")
		return
	}
	nodes, err := client.ListNodes(r.Context())
	if err != nil {
		fail(w, http.StatusBadGateway, headscale.FormatError(err))
		return
	}
	node, err := matchNode(nodes, body.Addresses)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{"error": err.Error(), "retry": err == errNodePending})
		return
	}
	org, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := a.Store.SyncMachines(r.Context(), org.ID, []headscale.Node{node}); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var machineID string
	var disabled bool
	if err := a.Store.DB.QueryRow(r.Context(), `SELECT "id","disabled" FROM "Machine" WHERE "headscaleNodeId"=?`, node.ID).Scan(&machineID, &disabled); err != nil {
		failRetry(w, "this computer has not registered yet")
		return
	}
	if disabled {
		fail(w, http.StatusForbidden, "this computer is disabled")
		return
	}
	if err := assignCreator(r.Context(), a.Store.DB, machineID, userID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := a.finishEnrollment(r.Context(), body.Enrollment, now); err != nil {
		if _, ok := err.(linkError); ok {
			fail(w, http.StatusGone, err.Error())
			return
		}
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	token, err := newDeviceToken()
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "DeviceCredential" WHERE "machineId"=?`, machineID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `INSERT INTO "DeviceCredential" ("id","machineId","tokenHash","createdAt") VALUES (?,?,?,?)`,
		id.New(), machineID, secretHash(token), time.Now().UTC()); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}

func (a *API) checkDevice(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		fail(w, http.StatusUnauthorized, "missing device token")
		return
	}
	var disabled bool
	err := a.Store.DB.QueryRow(r.Context(), `SELECT m."disabled" FROM "DeviceCredential" d JOIN "Machine" m ON m."id"=d."machineId" WHERE d."tokenHash"=?`, secretHash(token)).Scan(&disabled)
	if err != nil {
		fail(w, http.StatusUnauthorized, "this computer was removed")
		return
	}
	if disabled {
		fail(w, http.StatusForbidden, "this computer is disabled")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// deleteDevice removes this computer the same way the console Delete action does.
func (a *API) deleteDevice(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		fail(w, http.StatusUnauthorized, "missing device token")
		return
	}
	var machineID, hsID string
	var creator sql.NullString
	err := a.Store.DB.QueryRow(r.Context(), `SELECT m."id", m."headscaleNodeId", m."createdById" FROM "DeviceCredential" d JOIN "Machine" m ON m."id"=d."machineId" WHERE d."tokenHash"=?`, secretHash(token)).Scan(&machineID, &hsID, &creator)
	if err != nil {
		fail(w, http.StatusUnauthorized, "this computer was removed")
		return
	}
	if client := headscale.FromEnv(); client != nil && hsID != "" {
		if err := client.RemoveNode(r.Context(), hsID); err != nil {
			fail(w, http.StatusBadGateway, headscale.FormatError(err))
			return
		}
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "DeviceCredential" WHERE "machineId"=?`, machineID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "Machine" WHERE "id"=?`, machineID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if org, err := a.Store.DefaultOrg(r.Context()); err == nil {
		actor := ""
		if creator.Valid {
			actor = creator.String
		}
		_ = a.Store.Audit(r.Context(), org.ID, actor, "machine.deleted", "NETWORK", "machine", machineID, nil)
	}
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type clientWorkspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type clientMachine struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Hostname     string   `json:"hostname"`
	Addresses    []string `json:"addresses"`
	Online       bool     `json:"online"`
	CreatedByID  string   `json:"createdById"`
	AddedBy      string   `json:"addedBy"`
	WorkspaceIDs []string `json:"workspaceIds"`
}

type clientApp struct {
	ID           string   `json:"id"`
	Subdomain    string   `json:"subdomain"`
	Port         int      `json:"port"`
	Status       string   `json:"status"`
	Machine      string   `json:"machine"`
	MachineID    string   `json:"machineId"`
	CreatedByID  string   `json:"createdById"`
	AddedBy      string   `json:"addedBy"`
	WorkspaceIDs []string `json:"workspaceIds"`
}

// clientNetwork lists the linking user's workspaces, their machines, and running apps.
func (a *API) clientNetwork(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		fail(w, http.StatusUnauthorized, "missing device token")
		return
	}
	var machineID, orgID string
	var creator sql.NullString
	err := a.Store.DB.QueryRow(r.Context(), `SELECT m."id", m."organizationId", m."createdById" FROM "DeviceCredential" d JOIN "Machine" m ON m."id"=d."machineId" WHERE d."tokenHash"=?`, secretHash(token)).Scan(&machineID, &orgID, &creator)
	if err != nil {
		fail(w, http.StatusUnauthorized, "this computer was removed")
		return
	}
	if client := headscale.FromEnv(); client != nil {
		if nodes, err := client.ListNodes(r.Context()); err == nil {
			_ = a.Store.SyncMachines(r.Context(), orgID, nodes)
		}
	}
	workspaces, err := a.clientWorkspaces(r, creator, machineID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	ids := make([]string, 0, len(workspaces))
	for _, ws := range workspaces {
		ids = append(ids, ws.ID)
	}
	userID := ""
	if creator.Valid {
		userID = creator.String
	}
	machines, err := a.clientMachines(r, userID, ids)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	apps, err := a.clientApps(r, userID, ids)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"userId":     userID,
		"machineId":  machineID,
		"workspaces": workspaces,
		"machines":   machines,
		"apps":       apps,
	})
}

func (a *API) clientWorkspaces(r *http.Request, creator sql.NullString, machineID string) ([]clientWorkspace, error) {
	query := `SELECT g."id", g."name" FROM "MachineWorkspace" mw JOIN "Group" g ON g."id"=mw."groupId" WHERE mw."machineId"=? ORDER BY g."name"`
	args := []any{machineID}
	if creator.Valid && creator.String != "" {
		query = `SELECT g."id", g."name" FROM "WorkspaceMembership" wm JOIN "Group" g ON g."id"=wm."groupId" WHERE wm."userId"=? ORDER BY g."name"`
		args = []any{creator.String}
	}
	rows, err := a.Store.DB.Query(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []clientWorkspace{}
	for rows.Next() {
		var ws clientWorkspace
		if err := rows.Scan(&ws.ID, &ws.Name); err != nil {
			return nil, err
		}
		out = append(out, ws)
	}
	return out, rows.Err()
}

func (a *API) clientMachines(r *http.Request, userID string, workspaceIDs []string) ([]clientMachine, error) {
	out := []clientMachine{}
	query, args := ownedOrWorkspace(`SELECT DISTINCT m."id", m."name", m."hostname", m."ipAddresses", m."lastOnline", COALESCE(m."createdById",''), COALESCE(u."name",''), COALESCE(u."username",''), COALESCE(u."email",'') FROM "Machine" m LEFT JOIN "MachineWorkspace" mw ON mw."machineId"=m."id" LEFT JOIN "User" u ON u."id"=m."createdById"`, `m."createdById"=?`, `mw."groupId"`, userID, workspaceIDs, `m."name"`)
	if query == "" {
		return out, nil
	}
	rows, err := a.Store.DB.Query(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var machines []clientMachine
	var machineIDs []string
	for rows.Next() {
		var machine clientMachine
		var raw, personName, username, email string
		if err := rows.Scan(&machine.ID, &machine.Name, &machine.Hostname, &raw, &machine.Online, &machine.CreatedByID, &personName, &username, &email); err != nil {
			return nil, err
		}
		machine.AddedBy = displayPerson(personName, username, email)
		_ = json.Unmarshal([]byte(raw), &machine.Addresses)
		if machine.Addresses == nil {
			machine.Addresses = []string{}
		}
		machine.WorkspaceIDs = []string{}
		machines = append(machines, machine)
		machineIDs = append(machineIDs, machine.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	links, err := a.workspaceLinks(r, machineIDs)
	if err != nil {
		return nil, err
	}
	for i := range machines {
		if ids := links[machines[i].ID]; ids != nil {
			machines[i].WorkspaceIDs = ids
		}
	}
	if machines != nil {
		out = machines
	}
	return out, nil
}

func (a *API) clientApps(r *http.Request, userID string, workspaceIDs []string) ([]clientApp, error) {
	out := []clientApp{}
	base := `SELECT DISTINCT a."id", a."subdomain", a."port", a."status", m."name", a."machineId", COALESCE(a."createdById",''), COALESCE(u."name",''), COALESCE(u."username",''), COALESCE(u."email",'') FROM "PublishedApp" a JOIN "Machine" m ON m."id"=a."machineId" LEFT JOIN "User" u ON u."id"=a."createdById" LEFT JOIN "MachineWorkspace" mw ON mw."machineId"=m."id"`
	query, args := ownedOrWorkspace(base, `a."createdById"=?`, `mw."groupId"`, userID, workspaceIDs, `a."subdomain"`)
	if query == "" {
		return out, nil
	}
	if userID != "" && len(workspaceIDs) > 0 {
		query = strings.Replace(query, `mw."groupId" IN (`, `a."status"='ACTIVE' AND mw."groupId" IN (`, 1)
	}
	if userID == "" {
		query = strings.Replace(query, `WHERE mw."groupId" IN (`, `WHERE a."status"='ACTIVE' AND mw."groupId" IN (`, 1)
	}
	rows, err := a.Store.DB.Query(r.Context(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var apps []clientApp
	var machineIDs []string
	seen := map[string]struct{}{}
	for rows.Next() {
		var app clientApp
		var personName, username, email string
		if err := rows.Scan(&app.ID, &app.Subdomain, &app.Port, &app.Status, &app.Machine, &app.MachineID, &app.CreatedByID, &personName, &username, &email); err != nil {
			return nil, err
		}
		app.AddedBy = displayPerson(personName, username, email)
		app.WorkspaceIDs = []string{}
		apps = append(apps, app)
		if _, ok := seen[app.MachineID]; !ok {
			seen[app.MachineID] = struct{}{}
			machineIDs = append(machineIDs, app.MachineID)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	links, err := a.workspaceLinks(r, machineIDs)
	if err != nil {
		return nil, err
	}
	for i := range apps {
		if ids := links[apps[i].MachineID]; ids != nil {
			apps[i].WorkspaceIDs = ids
		}
	}
	if apps != nil {
		out = apps
	}
	return out, nil
}

func displayPerson(name, username, email string) string {
	if strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	if username != "" {
		return username
	}
	if email != "" {
		return email
	}
	return "—"
}

func ownedOrWorkspace(base, ownedExpr, groupExpr, userID string, workspaceIDs []string, orderBy string) (string, []any) {
	switch {
	case userID != "" && len(workspaceIDs) > 0:
		args := make([]any, 0, 1+len(workspaceIDs))
		args = append(args, userID)
		for _, id := range workspaceIDs {
			args = append(args, id)
		}
		return base + ` WHERE ` + ownedExpr + ` OR ` + groupExpr + ` IN (` + questionMarks(len(workspaceIDs)) + `) ORDER BY ` + orderBy, args
	case userID != "":
		return base + ` WHERE ` + ownedExpr + ` ORDER BY ` + orderBy, []any{userID}
	case len(workspaceIDs) > 0:
		args := make([]any, len(workspaceIDs))
		for i, id := range workspaceIDs {
			args[i] = id
		}
		return base + ` WHERE ` + groupExpr + ` IN (` + questionMarks(len(workspaceIDs)) + `) ORDER BY ` + orderBy, args
	default:
		return "", nil
	}
}

func (a *API) workspaceLinks(r *http.Request, machineIDs []string) (map[string][]string, error) {
	links := map[string][]string{}
	if len(machineIDs) == 0 {
		return links, nil
	}
	args := make([]any, len(machineIDs))
	for i, id := range machineIDs {
		args[i] = id
	}
	rows, err := a.Store.DB.Query(r.Context(), `SELECT "machineId", "groupId" FROM "MachineWorkspace" WHERE "machineId" IN (`+questionMarks(len(machineIDs))+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var machineID, groupID string
		if err := rows.Scan(&machineID, &groupID); err != nil {
			return nil, err
		}
		links[machineID] = append(links[machineID], groupID)
	}
	return links, rows.Err()
}

func questionMarks(n int) string {
	marks := make([]string, n)
	for i := range marks {
		marks[i] = "?"
	}
	return strings.Join(marks, ",")
}

func bearerToken(r *http.Request) string {
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if len(header) < len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

func newDeviceToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func matchNode(nodes []headscale.Node, addresses []string) (headscale.Node, error) {
	want := map[string]struct{}{}
	for _, addr := range addresses {
		addr = strings.TrimSpace(addr)
		if addr != "" {
			want[addr] = struct{}{}
		}
	}
	if len(want) == 0 {
		return headscale.Node{}, errNodePending
	}
	var hit *headscale.Node
	for i := range nodes {
		for _, addr := range nodes[i].Addresses {
			if _, ok := want[addr]; !ok {
				continue
			}
			if hit != nil && hit.ID != nodes[i].ID {
				return headscale.Node{}, errNodeAmbiguous
			}
			hit = &nodes[i]
		}
	}
	if hit == nil {
		return headscale.Node{}, errNodePending
	}
	return *hit, nil
}

func failRetry(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusConflict, map[string]any{"error": msg, "retry": true})
}

type nodeMatchError string

func (e nodeMatchError) Error() string { return string(e) }

const (
	errNodePending   nodeMatchError = "this computer has not registered yet"
	errNodeAmbiguous nodeMatchError = "could not match one computer"
)
