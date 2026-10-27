package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"otterscale/core/internal/audit"
	"otterscale/core/internal/db"
	httpapi "otterscale/core/internal/http"
	"otterscale/core/internal/store"
)

func main() {
	secret := strings.TrimSpace(os.Getenv("AUTH_SECRET"))
	if len(secret) < 32 {
		log.Fatal("AUTH_SECRET must be at least 32 characters")
	}
	dataDir := strings.TrimSpace(os.Getenv("OTTERSCALE_DATA_DIR"))
	if dataDir == "" {
		dataDir = "/data"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	database, err := db.Open(ctx, os.Getenv("DATABASE_URL"), dataDir)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Migrate(ctx, database); err != nil {
		log.Fatal(err)
	}
	if err := audit.CheckTip(ctx, database); err != nil {
		log.Printf("audit chain tip mismatch: %v", err)
	}
	cancel()

	api := httpapi.New(store.New(database), secret)
	addr := strings.TrimSpace(os.Getenv("CORE_ADDR"))
	if addr == "" {
		addr = ":4000"
	}
	log.Printf("core listening on %s (%s)", addr, database.Dialect)
	if err := http.ListenAndServe(addr, api.Handler()); err != nil {
		log.Fatal(err)
	}
}
