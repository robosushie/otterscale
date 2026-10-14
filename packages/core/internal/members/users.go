package members

import (
	"context"
	"database/sql"
	"strings"

	"otterscale/core/internal/db"
)

type User struct {
	ID           string
	Username     string
	Name         sql.NullString
	Email        string
	PasswordHash   sql.NullString
	TotpSecret     sql.NullString
	TotpEnabled    bool
	LoginDisabled  bool
}

type Row struct {
	ID           string   `json:"id"`
	Username     string   `json:"username"`
	Email        string   `json:"email"`
	Name         string   `json:"name"`
	Role         string   `json:"role"`
	RoleKey      string   `json:"roleKey"`
	Joined       string   `json:"joined"`
	WorkspaceIDs  []string `json:"workspaceIds"`
	Groups        []string `json:"workspaces"`
	LoginDisabled bool     `json:"loginDisabled"`
}

func Find(ctx context.Context, database *db.DB, ident string) (User, error) {
	ident = strings.TrimSpace(ident)
	var user User
	err := database.QueryRow(ctx, `SELECT "id","username","name","email","passwordHash","totpSecret","totpEnabled","loginDisabled" FROM "User" WHERE "username"=? OR lower("email")=?`, ident, strings.ToLower(ident)).
		Scan(&user.ID, &user.Username, &user.Name, &user.Email, &user.PasswordHash, &user.TotpSecret, &user.TotpEnabled, &user.LoginDisabled)
	return user, err
}

func ByID(ctx context.Context, database *db.DB, userID string) (User, error) {
	var user User
	err := database.QueryRow(ctx, `SELECT "id","username","name","email","passwordHash","totpSecret","totpEnabled","loginDisabled" FROM "User" WHERE "id"=?`, userID).
		Scan(&user.ID, &user.Username, &user.Name, &user.Email, &user.PasswordHash, &user.TotpSecret, &user.TotpEnabled, &user.LoginDisabled)
	return user, err
}

func List(ctx context.Context, database *db.DB) ([]Row, error) {
	rows, err := database.Query(ctx, `SELECT "id","username","email",COALESCE("name",''),"createdAt","loginDisabled" FROM "User" ORDER BY "email" ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var row Row
		var created sql.NullTime
		if err := rows.Scan(&row.ID, &row.Username, &row.Email, &row.Name, &created, &row.LoginDisabled); err != nil {
			return nil, err
		}
		if created.Valid {
			row.Joined = created.Time.UTC().Format("2 Jan 2006")
		} else {
			row.Joined = "—"
		}
		var platform, tenant sql.NullString
		_ = database.QueryRow(ctx, `SELECT "role" FROM "PlatformMembership" WHERE "userId"=? AND "role"='OWNER'`, row.ID).Scan(&platform)
		if !platform.Valid {
			_ = database.QueryRow(ctx, `SELECT "role" FROM "PlatformMembership" WHERE "userId"=? AND "role"='SUPER_ADMIN'`, row.ID).Scan(&platform)
		}
		_ = database.QueryRow(ctx, `SELECT "role" FROM "TenantMembership" WHERE "userId"=? ORDER BY "createdAt" ASC LIMIT 1`, row.ID).Scan(&tenant)
		switch {
		case platform.String == "OWNER":
			row.Role, row.RoleKey = "Owner", "OWNER"
		case platform.String == "SUPER_ADMIN":
			row.Role, row.RoleKey = "Super admin", "SUPER_ADMIN"
		case tenant.String == "ADMIN":
			row.Role, row.RoleKey = "Admin", "ADMIN"
		case tenant.String == "MEMBER":
			row.Role, row.RoleKey = "Member", "MEMBER"
		default:
			row.Role, row.RoleKey = "—", "MEMBER"
		}
		grows, err := database.Query(ctx, `SELECT g."id", g."name" FROM "WorkspaceMembership" m JOIN "Group" g ON g."id"=m."groupId" WHERE m."userId"=? ORDER BY g."name"`, row.ID)
		if err == nil {
			for grows.Next() {
				var gid, name string
				_ = grows.Scan(&gid, &name)
				row.WorkspaceIDs = append(row.WorkspaceIDs, gid)
				row.Groups = append(row.Groups, name)
			}
			grows.Close()
		}
		if row.Groups == nil {
			row.Groups = []string{}
		}
		if row.WorkspaceIDs == nil {
			row.WorkspaceIDs = []string{}
		}
		out = append(out, row)
	}
	if out == nil {
		out = []Row{}
	}
	return out, nil
}
