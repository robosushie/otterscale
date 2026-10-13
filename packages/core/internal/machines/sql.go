package machines

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/db"
	"otterscale/core/internal/headscale"
	"otterscale/core/internal/id"
)

type MachineRow struct {
	MachineID            string   `json:"machineId"`
	Name                 string   `json:"name"`
	Addresses            string   `json:"addresses"`
	LastSeen             string   `json:"lastSeen"`
	Online               bool     `json:"online"`
	WorkspaceNames       []string `json:"workspaceNames"`
	TagNames             []string `json:"tagNames"`
	SelectedWorkspaceIDs []string `json:"selectedWorkspaceIds"`
	SelectedTagIDs       []string `json:"selectedTagIds"`
	AddedBy              string   `json:"addedBy"`
}

type Table struct {
	Rows           []MachineRow `json:"rows"`
	Unassigned     int          `json:"unassigned"`
	HeadscaleError *string      `json:"headscaleError"`
	Configured     bool         `json:"configured"`
	CanManage      bool         `json:"canManage"`
	Workspaces     []Named      `json:"workspaces"`
	Tags           []TagOption  `json:"tags"`
	LoginServer    string       `json:"loginServer"`
}

type Viewer struct {
	IsPlatformAdmin bool
	WorkspaceIDs    []string
	Capabilities    []string
}

func Sync(ctx context.Context, database *db.DB, orgID string, nodes []headscale.Node, groups []Named, tags []TagOption) error {
	named := make([]Named, len(groups))
	for i, g := range groups {
		named[i] = Named{ID: g.ID, Name: g.Name}
	}
	tagged := make([]Tagged, len(tags))
	for i, t := range tags {
		tagged[i] = Tagged{ID: t.ID, ACLTag: t.ACLTag}
	}
	for _, node := range nodes {
		if node.ID == "" {
			continue
		}
		var machineID string
		err := database.QueryRow(ctx, `SELECT "id" FROM "Machine" WHERE "headscaleNodeId"=?`, node.ID).Scan(&machineID)
		ips, _ := json.Marshal(node.Addresses)
		now := time.Now().UTC()
		var seen any
		if node.LastSeen != "" {
			if t, err := time.Parse(time.RFC3339, node.LastSeen); err == nil {
				seen = t.UTC()
			}
		}
		if err == sql.ErrNoRows {
			machineID = id.New()
			creator, _ := inferCreator(ctx, database, orgID, node.UserName)
			name := node.Name
			if name == "" {
				name = node.Hostname
			}
			if name == "" {
				name = node.ID
			}
			if _, err := database.Exec(ctx, `INSERT INTO "Machine" ("id","organizationId","headscaleNodeId","name","hostname","ipAddresses","lastOnline","lastSeenAt","createdById","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
				machineID, orgID, node.ID, name, node.Hostname, string(ips), node.Online, seen, creator, now, now); err != nil {
				return err
			}
			if err := applyLabels(ctx, database, machineID, node.Tags, named, tagged); err != nil {
				return err
			}
			action := "machine.registered"
			if node.Online {
				action = "machine.online"
			}
			_ = audit.Append(ctx, database, orgID, "", action, "NETWORK", "machine", node.ID, map[string]any{"name": name, "online": node.Online})
			continue
		}
		if err != nil {
			return err
		}
		if _, err := database.Exec(ctx, `UPDATE "Machine" SET "hostname"=?,"ipAddresses"=?,"lastOnline"=?,"lastSeenAt"=?,"updatedAt"=? WHERE "id"=?`,
			node.Hostname, string(ips), node.Online, seen, now, machineID); err != nil {
			return err
		}
		if err := applyLabels(ctx, database, machineID, node.Tags, named, tagged); err != nil {
			return err
		}
	}
	return nil
}

func applyLabels(ctx context.Context, database *db.DB, machineID string, aclTags []string, groups []Named, tags []Tagged) error {
	if len(aclTags) == 0 {
		return nil
	}
	wsIDs, tagIDs := MatchACLLabels(aclTags, groups, tags)
	if len(wsIDs) == 0 && len(tagIDs) == 0 {
		return nil
	}
	currentWS := map[string]struct{}{}
	rows, err := database.Query(ctx, `SELECT "groupId" FROM "MachineWorkspace" WHERE "machineId"=?`, machineID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		currentWS[id] = struct{}{}
	}
	rows.Close()
	currentTags := map[string]struct{}{}
	rows, err = database.Query(ctx, `SELECT "tagId" FROM "MachineTag" WHERE "machineId"=?`, machineID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		currentTags[id] = struct{}{}
	}
	rows.Close()
	if sameSet(currentWS, wsIDs) && sameSet(currentTags, tagIDs) {
		return nil
	}
	if _, err := database.Exec(ctx, `DELETE FROM "MachineWorkspace" WHERE "machineId"=?`, machineID); err != nil {
		return err
	}
	if _, err := database.Exec(ctx, `DELETE FROM "MachineTag" WHERE "machineId"=?`, machineID); err != nil {
		return err
	}
	for _, gid := range wsIDs {
		if _, err := database.Exec(ctx, `INSERT INTO "MachineWorkspace" ("machineId","groupId") VALUES (?,?)`, machineID, gid); err != nil {
			return err
		}
	}
	for _, tid := range tagIDs {
		if _, err := database.Exec(ctx, `INSERT INTO "MachineTag" ("machineId","tagId") VALUES (?,?)`, machineID, tid); err != nil {
			return err
		}
	}
	return nil
}

func inferCreator(ctx context.Context, database *db.DB, orgID, userName string) (any, error) {
	ident := strings.TrimSpace(userName)
	if ident != "" {
		var id string
		err := database.QueryRow(ctx, `SELECT "id" FROM "User" WHERE lower("email")=? OR "username"=?`, strings.ToLower(ident), ident).Scan(&id)
		if err == nil {
			return id, nil
		}
	}
	var actor sql.NullString
	err := database.QueryRow(ctx, `SELECT "actorId" FROM "AuditEvent" WHERE "organizationId"=? AND "action"='authkey.created' AND "actorId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`, orgID).Scan(&actor)
	if err == nil && actor.Valid {
		return actor.String, nil
	}
	return nil, nil
}

func BuildTable(ctx context.Context, database *db.DB, orgID string, viewer Viewer, nodes []headscale.Node, hsErr string, configured bool, loginServer string, groups []Named, tags []TagOption) (Table, error) {
	visibleGroups := groups
	if !viewer.IsPlatformAdmin {
		allowed := map[string]struct{}{}
		for _, id := range viewer.WorkspaceIDs {
			allowed[id] = struct{}{}
		}
		visibleGroups = nil
		for _, g := range groups {
			if _, ok := allowed[g.ID]; ok {
				visibleGroups = append(visibleGroups, g)
			}
		}
	}
	assignable := make([]TagOption, 0)
	for _, tag := range tags {
		if tag.ACLTag == EdgeTag || strings.EqualFold(tag.Name, "edge") {
			continue
		}
		assignable = append(assignable, tag)
	}
	type dbMachine struct {
		id, name, hostname, ips string
		online                  bool
		seen                    sql.NullTime
		added                   sql.NullString
		ws                      []string
		tagIDs                  []string
		tagNames                []string
		acl                     []string
	}
	rows, err := database.Query(ctx, `SELECT m."id", m."headscaleNodeId", m."name", m."hostname", m."ipAddresses", m."lastOnline", m."lastSeenAt", u."name", u."username", u."email" FROM "Machine" m LEFT JOIN "User" u ON u."id"=m."createdById" WHERE m."organizationId"=?`, orgID)
	if err != nil {
		return Table{}, err
	}
	byHS := map[string]dbMachine{}
	for rows.Next() {
		var m dbMachine
		var hsID string
		var uname, uuser, uemail sql.NullString
		if err := rows.Scan(&m.id, &hsID, &m.name, &m.hostname, &m.ips, &m.online, &m.seen, &uname, &uuser, &uemail); err != nil {
			rows.Close()
			return Table{}, err
		}
		m.added = sql.NullString{String: person(uname, uuser, uemail), Valid: true}
		m.ws, m.tagIDs, m.tagNames, m.acl = machineLinks(ctx, database, m.id, tags)
		byHS[hsID] = m
	}
	rows.Close()
	table := Table{Rows: []MachineRow{}, Configured: configured, CanManage: hasCap(viewer, "network.manage"), Workspaces: visibleGroups, Tags: assignable, LoginServer: loginServer}
	if hsErr != "" {
		table.HeadscaleError = &hsErr
	}
	for _, node := range nodes {
		row, ok := byHS[node.ID]
		if !ok {
			continue
		}
		if IsEdgeMachine(node.Name, node.Hostname, node.Tags) || IsEdgeMachine(row.name, row.hostname, row.acl) {
			continue
		}
		if !MachineVisible(row.ws, viewer.IsPlatformAdmin, viewer.WorkspaceIDs) {
			continue
		}
		addrs := strings.Join(node.Addresses, ", ")
		if addrs == "" {
			var parsed []string
			_ = json.Unmarshal([]byte(row.ips), &parsed)
			addrs = strings.Join(parsed, ", ")
		}
		if addrs == "" {
			addrs = "—"
		}
		seen := "—"
		if node.LastSeen != "" {
			if t, err := time.Parse(time.RFC3339, node.LastSeen); err == nil {
				seen = t.Local().Format(time.RFC1123)
			}
		}
		names := []string{}
		for _, g := range groups {
			for _, id := range row.ws {
				if g.ID == id {
					names = append(names, g.Name)
				}
			}
		}
		if names == nil {
			names = []string{}
		}
		if row.tagNames == nil {
			row.tagNames = []string{}
		}
		if row.ws == nil {
			row.ws = []string{}
		}
		if row.tagIDs == nil {
			row.tagIDs = []string{}
		}
		table.Rows = append(table.Rows, MachineRow{
			MachineID: row.id, Name: row.name, Addresses: addrs, LastSeen: seen, Online: node.Online,
			WorkspaceNames: names, TagNames: row.tagNames, SelectedWorkspaceIDs: row.ws, SelectedTagIDs: row.tagIDs, AddedBy: row.added.String,
		})
	}
	if viewer.IsPlatformAdmin {
		live := map[string]struct{}{}
		for _, node := range nodes {
			live[node.ID] = struct{}{}
		}
		for hsID, row := range byHS {
			if _, ok := live[hsID]; ok || IsEdgeMachine(row.name, row.hostname, row.acl) || len(row.ws) > 0 {
				continue
			}
			table.Unassigned++
		}
	}
	return table, nil
}

func machineLinks(ctx context.Context, database *db.DB, machineID string, tags []TagOption) (ws, tagIDs, tagNames, acl []string) {
	rows, err := database.Query(ctx, `SELECT "groupId" FROM "MachineWorkspace" WHERE "machineId"=?`, machineID)
	if err == nil {
		for rows.Next() {
			var id string
			_ = rows.Scan(&id)
			ws = append(ws, id)
		}
		rows.Close()
	}
	rows, err = database.Query(ctx, `SELECT "tagId" FROM "MachineTag" WHERE "machineId"=?`, machineID)
	if err == nil {
		for rows.Next() {
			var id string
			_ = rows.Scan(&id)
			tagIDs = append(tagIDs, id)
			for _, tag := range tags {
				if tag.ID == id {
					tagNames = append(tagNames, tag.Name)
					acl = append(acl, tag.ACLTag)
				}
			}
		}
		rows.Close()
	}
	return ws, tagIDs, tagNames, acl
}

func person(name, username, email sql.NullString) string {
	if name.Valid && strings.TrimSpace(name.String) != "" {
		return name.String
	}
	if username.Valid && username.String != "" {
		return username.String
	}
	if email.Valid {
		return email.String
	}
	return "—"
}

func sameSet(current map[string]struct{}, next []string) bool {
	if len(current) != len(next) {
		return false
	}
	for _, id := range next {
		if _, ok := current[id]; !ok {
			return false
		}
	}
	return true
}

func hasCap(viewer Viewer, cap string) bool {
	for _, c := range viewer.Capabilities {
		if c == cap {
			return true
		}
	}
	return false
}
