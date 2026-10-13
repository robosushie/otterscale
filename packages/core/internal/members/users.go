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
	PasswordHash sql.NullString
	TotpSecret   sql.NullString
	TotpEnabled  bool
}

type Row struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Email    string   `json:"email"`
	Name     string   `json:"name"`
	Role     string   `json:"role"`
	Groups   []string `json:"workspaces"`
}

func Find(ctx context.Context, database *db.DB, ident string) (User, error) {
	ident = strings.TrimSpace(ident)
	var user User
	err := database.QueryRow(ctx, `SELECT "id","username","name","email","passwordHash","totpSecret","totpEnabled" FROM "User" WHERE "username"=? OR lower("email")=?`, ident, strings.ToLower(ident)).
		Scan(&user.ID, &user.Username, &user.Name, &user.Email, &user.PasswordHash, &user.TotpSecret, &user.TotpEnabled)
	return user, err
}

func ByID(ctx context.Context, database *db.DB, userID string) (User, error) {
	var user User
	err := database.QueryRow(ctx, `SELECT "id","username","name","email","passwordHash","totpSecret","totpEnabled" FROM "User" WHERE "id"=?`, userID).
		Scan(&user.ID, &user.Username, &user.Name, &user.Email, &user.PasswordHash, &user.TotpSecret, &user.TotpEnabled)
	return user, err
}

func List(ctx context.Context, database *db.DB) ([]Row, error) {
	rows, err := database.Query(ctx, `SELECT "id","username","email",COALESCE("name",'') FROM "User" ORDER BY "email" ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var row Row
		if err := rows.Scan(&row.ID, &row.Username, &row.Email, &row.Name); err != nil {
			return nil, err
		}
		var platform, tenant sql.NullString
		_ = database.QueryRow(ctx, `SELECT "role" FROM "PlatformMembership" WHERE "userId"=? AND "role"='OWNER'`, row.ID).Scan(&platform)
		if !platform.Valid {
			_ = database.QueryRow(ctx, `SELECT "role" FROM "PlatformMembership" WHERE "userId"=? AND "role"='SUPER_ADMIN'`, row.ID).Scan(&platform)
		}
		_ = database.QueryRow(ctx, `SELECT "role" FROM "TenantMembership" WHERE "userId"=? ORDER BY "createdAt" ASC LIMIT 1`, row.ID).Scan(&tenant)
		switch {
		case platform.String == "OWNER":
			row.Role = "Owner"
		case platform.String == "SUPER_ADMIN":
			row.Role = "Super admin"
		case tenant.String == "ADMIN":
			row.Role = "Admin"
		case tenant.String == "MEMBER":
			row.Role = "Member"
		default:
			row.Role = "—"
		}
		grows, err := database.Query(ctx, `SELECT g."name" FROM "WorkspaceMembership" m JOIN "Group" g ON g."id"=m."groupId" WHERE m."userId"=? ORDER BY g."name"`, row.ID)
		if err == nil {
			for grows.Next() {
				var name string
				_ = grows.Scan(&name)
				row.Groups = append(row.Groups, name)
			}
			grows.Close()
		}
		if row.Groups == nil {
			row.Groups = []string{}
		}
		out = append(out, row)
	}
	if out == nil {
		out = []Row{}
	}
	return out, nil
}
