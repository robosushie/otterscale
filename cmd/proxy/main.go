package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"otterscale/internal/appsproxy"

	"tailscale.com/tsnet"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("proxy: ")

	controlURL := strings.TrimSpace(os.Getenv("HEADSCALE_INTERNAL_URL"))
	if controlURL == "" {
		controlURL = "http://headscale:8080"
	}
	authKey := strings.TrimSpace(os.Getenv("APPS_EDGE_AUTHKEY"))
	if authKey == "" {
		log.Fatal("APPS_EDGE_AUTHKEY is required")
	}
	stateDir := strings.TrimSpace(os.Getenv("TS_STATE_DIR"))
	if stateDir == "" {
		stateDir = "/var/lib/tailscale"
	}
	routesPath := strings.TrimSpace(os.Getenv("APPS_ROUTES_PATH"))
	if routesPath == "" {
		routesPath = "/data/apps-caddy/routes.json"
	}
	listenAddr := envOr("LISTEN_ADDR", ":80")
	probeAddr := envOr("PROBE_ADDR", ":4180")
	hostname := envOr("TS_HOSTNAME", "edge")

	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		log.Fatalf("state dir: %v", err)
	}

	table := &appsproxy.Table{}
	if err := table.Load(routesPath); err != nil {
		log.Printf("initial routes load: %v", err)
	}

	ts := &tsnet.Server{
		Dir:           stateDir,
		Hostname:      hostname,
		AuthKey:       authKey,
		ControlURL:    controlURL,
		AdvertiseTags: []string{"tag:edge"},
		Ephemeral:     false,
	}
	defer func() { _ = ts.Close() }()

	if err := ts.Start(); err != nil {
		log.Fatalf("tsnet start: %v", err)
	}

	srv := &appsproxy.Server{
		Table: table,
		Dial:  ts.Dial,
	}

	go watchRoutes(table, routesPath)
	go waitReady(ts, srv)

	appHTTP := &http.Server{Addr: listenAddr, Handler: srv.AppHandler()}
	probeHTTP := &http.Server{Addr: probeAddr, Handler: srv.ProbeHandler()}

	errCh := make(chan error, 2)
	go func() {
		log.Printf("apps listen %s", listenAddr)
		errCh <- appHTTP.ListenAndServe()
	}()
	go func() {
		log.Printf("probe listen %s", probeAddr)
		errCh <- probeHTTP.ListenAndServe()
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http: %v", err)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_ = appHTTP.Shutdown(shutdownCtx)
	_ = probeHTTP.Shutdown(shutdownCtx)
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func watchRoutes(table *appsproxy.Table, path string) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if err := table.Load(path); err != nil {
			log.Printf("routes load: %v", err)
		}
	}
}

func waitReady(ts *tsnet.Server, srv *appsproxy.Server) {
	for {
		ip4, _ := ts.TailscaleIPs()
		if ip4.IsValid() && ip4.Is4() {
			srv.Ready.Store(true)
			log.Printf("tsnet ready %s", ip4)
			return
		}
		time.Sleep(time.Second)
	}
}
