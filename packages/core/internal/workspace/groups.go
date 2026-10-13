package workspace

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
	"otterscale/core/internal/machines"
	"otterscale/core/internal/members"
	"otterscale/core/internal/org"
)

type Row struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Members []string `json:"members"`
}

func List(ctx context.Context, database *db.DB) ([]Row, error) {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return nil, err
	}
	rows, err := database.Query(ctx, `SELECT "id","name" FROM "Group" WHERE "organizationId"=? ORDER BY "name" ASC`, organisation.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var row Row
		if err := rows.Scan(&row.ID, &row.Name); err != nil {
			return nil, err
		}
		row.Members = emails(ctx, database, row.ID)
		out = append(out, row)
	}
	if out == nil {
		out = []Row{}
	}
	return out, nil
}

func emails(ctx context.Context, database *db.DB, groupID string) []string {
	seen := map[string]struct{}{}
	var list []string
	add := func(email string) {
		email = strings.TrimSpace(email)
		if email == "" {
			return
		}
		if _, ok := seen[email]; ok {
			return
		}
		seen[email] = struct{}{}
		list = append(list, email)
	}
	rows, err := database.Query(ctx, `SELECT "email" FROM "GroupMember" WHERE "groupId"=?`, groupID)
	if err == nil {
		for rows.Next() {
			var email string
			_ = rows.Scan(&email)
			add(email)
		}
		rows.Close()
	}
	rows, err = database.Query(ctx, `SELECT u."email" FROM "WorkspaceMembership" m JOIN "User" u ON u."id"=m."userId" WHERE m."groupId"=?`, groupID)
	if err == nil {
		for rows.Next() {
			var email sql.NullString
			_ = rows.Scan(&email)
			if email.Valid {
				add(email.String)
			}
		}
		rows.Close()
	}
	if list == nil {
		list = []string{}
	}
	return list
}

func Create(ctx context.Context, database *db.DB, actorID, name string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	gid := id.New()
	now := time.Now().UTC()
	if _, err := database.Exec(ctx, `INSERT INTO "Group" ("id","organizationId","name","createdAt","updatedAt") VALUES (?,?,?,?,?)`, gid, organisation.ID, name, now, now); err != nil {
		return err
	}
	user, _ := members.ByID(ctx, database, actorID)
	if user.Email != "" {
		_, _ = database.Exec(ctx, `INSERT INTO "GroupMember" ("id","groupId","userId","email","createdAt") VALUES (?,?,?,?,?)`, id.New(), gid, actorID, user.Email, now)
		_, _ = database.Exec(ctx, `INSERT INTO "WorkspaceMembership" ("id","userId","groupId","role","createdAt") VALUES (?,?,?,?,?)`, id.New(), actorID, gid, "ADMIN", now)
	}
	return audit.Append(ctx, database, organisation.ID, actorID, "workspace.created", "SYSTEM", "group", gid, map[string]string{"name": name})
}

func AddMember(ctx context.Context, database *db.DB, actorID, groupID, email, role string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if role != "ADMIN" {
		role = "MEMBER"
	}
	now := time.Now().UTC()
	var userID sql.NullString
	_ = database.QueryRow(ctx, `SELECT "id" FROM "User" WHERE lower("email")=?`, email).Scan(&userID)
	_, err = database.Exec(ctx, `INSERT INTO "GroupMember" ("id","groupId","userId","email","createdAt") VALUES (?,?,?,?,?) ON CONFLICT ("groupId","email") DO UPDATE SET "userId"=excluded."userId"`,
		id.New(), groupID, nullable(userID), email, now)
	if err != nil {
		return err
	}
	if userID.Valid {
		_, _ = database.Exec(ctx, `INSERT INTO "WorkspaceMembership" ("id","userId","groupId","role","createdAt") VALUES (?,?,?,?,?) ON CONFLICT ("userId","groupId") DO UPDATE SET "role"=excluded."role"`,
			id.New(), userID.String, groupID, role, now)
	}
	return audit.Append(ctx, database, organisation.ID, actorID, "workspace.member_added", "SYSTEM", "group", groupID, map[string]string{"email": email, "role": role})
}

func nullable(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}

func CreateTag(ctx context.Context, database *db.DB, actorID, name string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	slug := strings.Trim(strings.ToLower(name), " ")
	slug = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return '-'
	}, slug)
	slug = strings.Trim(slug, "-")
	now := time.Now().UTC()
	tid := id.New()
	_, err = database.Exec(ctx, `INSERT INTO "Tag" ("id","organizationId","name","slug","aclTag","createdAt") VALUES (?,?,?,?,?,?)`,
		tid, organisation.ID, name, slug, machines.ACLTagForSlug(slug), now)
	if err != nil {
		return err
	}
	return audit.Append(ctx, database, organisation.ID, actorID, "tag.created", "SYSTEM", "tag", tid, map[string]string{"name": name})
}

func CreateRule(ctx context.Context, database *db.DB, actorID, groupID, tagID, ports string) error {
	organisation, err := org.Default(ctx, database)
	if err != nil {
		return err
	}
	if ports == "" {
		ports = "*"
	}
	var tag any
	if tagID != "" {
		tag = tagID
	}
	now := time.Now().UTC()
	rid := id.New()
	_, err = database.Exec(ctx, `INSERT INTO "AccessRule" ("id","organizationId","groupId","tagId","ports","action","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?)`,
		rid, organisation.ID, groupID, tag, ports, "accept", now, now)
	if err != nil {
		return err
	}
	return audit.Append(ctx, database, organisation.ID, actorID, "access_rule.created", "SYSTEM", "access_rule", rid, map[string]string{"ports": ports})
}

func NamedGroups(ctx context.Context, database *db.DB, orgID string) ([]machines.Named, error) {
	rows, err := database.Query(ctx, `SELECT "id","name" FROM "Group" WHERE "organizationId"=? ORDER BY "name" ASC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []machines.Named
	for rows.Next() {
		var n machines.Named
		if err := rows.Scan(&n.ID, &n.Name); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	if out == nil {
		out = []machines.Named{}
	}
	return out, nil
}

func Tags(ctx context.Context, database *db.DB, orgID string) ([]machines.TagOption, error) {
	rows, err := database.Query(ctx, `SELECT "id","name","aclTag" FROM "Tag" WHERE "organizationId"=? ORDER BY "name" ASC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []machines.TagOption
	for rows.Next() {
		var t machines.TagOption
		if err := rows.Scan(&t.ID, &t.Name, &t.ACLTag); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if out == nil {
		out = []machines.TagOption{}
	}
	return out, nil
}
