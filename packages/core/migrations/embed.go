package migrations

import "embed"

//go:embed sqlite/*.sql
var SQLite embed.FS

//go:embed postgres/*.sql
var Postgres embed.FS

func SQLiteFS() embed.FS { return SQLite }

func PostgresFS() embed.FS { return Postgres }
