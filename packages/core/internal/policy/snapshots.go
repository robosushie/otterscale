package policy

import (
	"context"
	"database/sql"
	"time"

	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
	"otterscale/core/internal/machines"
	"otterscale/core/internal/org"
	"otterscale/core/internal/workspace"
)

type View struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Hash      string `json:"contentHash"`
	HuJSON    string `json:"hujson"`
	CreatedAt string `json:"createdAt"`
}

func CompileInputFor(ctx context.Context, database *db.DB, orgID string) (CompileInput, error) {
	groups, err := workspace.List(ctx, database)
	if err != nil {
		return CompileInput{}, err
	}
	input := CompileInput{EdgeTag: machines.EdgeTag}
	for _, g := range groups {
		input.Workspaces = append(input.Workspaces, CompileWorkspace{
			Name: g.Name, MemberEmails: g.Members, WorkspaceTag: machines.WorkspaceTagName(g.Name),
		})
		input.TagOwnerEmails = append(input.TagOwnerEmails, g.Members...)
	}
	tags, err := workspace.Tags(ctx, database, orgID)
	if err != nil {
		return CompileInput{}, err
	}
	for _, tag := range tags {
		input.Tags = append(input.Tags, tag.ACLTag)
	}
	rows, err := database.Query(ctx, `SELECT g."name", t."aclTag", r."ports" FROM "AccessRule" r JOIN "Group" g ON g."id"=r."groupId" LEFT JOIN "Tag" t ON t."id"=r."tagId" WHERE r."organizationId"=?`, orgID)
	if err != nil {
		return CompileInput{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var group, ports string
		var tag sql.NullString
		if err := rows.Scan(&group, &tag, &ports); err != nil {
			return CompileInput{}, err
		}
		dest := "*"
		if tag.Valid && tag.String != "" {
			dest = tag.String
		}
		input.ExtraRules = append(input.ExtraRules, CompileRule{SrcGroup: group, DestTag: dest, Ports: ports})
	}
	return input, nil
}

func Save(ctx context.Context, database *db.DB, orgID, authorID string, compiled CompiledPolicy, status, errMsg string) (string, error) {
	sid := id.New()
	var author any
	if authorID != "" {
		author = authorID
	}
	var applied any
	if status == "APPLIED" {
		applied = time.Now().UTC()
	}
	var msg any
	if errMsg != "" {
		msg = errMsg
	}
	_, err := database.Exec(ctx, `INSERT INTO "PolicySnapshot" ("id","organizationId","contentHash","hujson","status","authorId","appliedAt","errorMessage","createdAt") VALUES (?,?,?,?,?,?,?,?,?)`,
		sid, orgID, compiled.ContentHash, compiled.HuJSON, status, author, applied, msg, time.Now().UTC())
	return sid, err
}

func List(ctx context.Context, database *db.DB) ([]View, error) {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return nil, err
	}
	rows, err := database.Query(ctx, `SELECT "id","status","contentHash","hujson","createdAt" FROM "PolicySnapshot" WHERE "organizationId"=? ORDER BY "createdAt" DESC LIMIT 20`, organisation.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []View
	for rows.Next() {
		var p View
		var created time.Time
		if err := rows.Scan(&p.ID, &p.Status, &p.Hash, &p.HuJSON, &created); err != nil {
			return nil, err
		}
		p.CreatedAt = created.UTC().Format(time.RFC3339)
		out = append(out, p)
	}
	if out == nil {
		out = []View{}
	}
	return out, nil
}
