package appsproxy

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPreferMeshIP(t *testing.T) {
	t.Parallel()
	got := PreferMeshIP([]string{"fd7a:115c:a1e0::1", "100.64.0.3"})
	if got != "100.64.0.3" {
		t.Fatalf("PreferMeshIP = %q, want IPv4 first", got)
	}
	got = PreferMeshIP([]string{"fd7a:115c:a1e0::1"})
	if got != "fd7a:115c:a1e0::1" {
		t.Fatalf("PreferMeshIP = %q, want IPv6 fallback", got)
	}
	if PreferMeshIP(nil) != "" {
		t.Fatal("empty addrs should yield empty IP")
	}
}

func TestDialAddrBracketsIPv6(t *testing.T) {
	t.Parallel()
	got := DialAddr("fd7a:115c:a1e0::1", 5173)
	if got != "[fd7a:115c:a1e0::1]:5173" {
		t.Fatalf("DialAddr = %q", got)
	}
	got = DialAddr("100.64.0.3", 5173)
	if got != "100.64.0.3:5173" {
		t.Fatalf("DialAddr = %q", got)
	}
}

func TestNormalizeHost(t *testing.T) {
	t.Parallel()
	if got := NormalizeHost("Rumigo.apps.localhost:443"); got != "rumigo.apps.localhost" {
		t.Fatalf("NormalizeHost = %q", got)
	}
}

func TestTableLookup(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "routes.json")
	body := `{"baseDomain":"apps.localhost","routes":[{"id":"abc","subdomain":"rumigo","ip":"100.64.0.3","port":5173}]}`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	var table Table
	if err := table.Load(path); err != nil {
		t.Fatal(err)
	}
	route, ok := table.Lookup("rumigo.apps.localhost")
	if !ok || route.IP != "100.64.0.3" || route.Port != 5173 {
		t.Fatalf("lookup = %+v ok=%v", route, ok)
	}
	if _, ok := table.Lookup("missing.apps.localhost"); ok {
		t.Fatal("expected miss")
	}
	if err := table.Load(filepath.Join(dir, "missing.json")); err != nil {
		t.Fatal(err)
	}
	if _, ok := table.Lookup("rumigo.apps.localhost"); ok {
		t.Fatal("missing file should clear routes")
	}
}

func TestUnknownApp404(t *testing.T) {
	t.Parallel()
	srv := &Server{Table: &Table{byHost: map[string]Route{}}}
	req := httptest.NewRequest(http.MethodGet, "http://missing.apps.localhost/", nil)
	req.Host = "missing.apps.localhost"
	rec := httptest.NewRecorder()
	srv.AppHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), UnknownAppMessage) {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestReverseProxyOKAnd502(t *testing.T) {
	t.Parallel()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "rumigo")
	}))
	t.Cleanup(upstream.Close)

	table := &Table{byHost: map[string]Route{
		"rumigo.apps.localhost": {Subdomain: "rumigo", IP: "127.0.0.1", Port: 9},
	}}
	okDial := func(ctx context.Context, network, address string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "tcp", upstream.Listener.Addr().String())
	}
	srv := &Server{Table: table, Dial: okDial}
	req := httptest.NewRequest(http.MethodGet, "http://rumigo.apps.localhost/", nil)
	req.Host = "rumigo.apps.localhost"
	rec := httptest.NewRecorder()
	srv.AppHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != "rumigo" {
		t.Fatalf("ok proxy status=%d body=%q", rec.Code, rec.Body.String())
	}

	srv.Dial = func(context.Context, string, string) (net.Conn, error) {
		return nil, errors.New("offline")
	}
	rec = httptest.NewRecorder()
	srv.AppHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("dial fail status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), OfflineMessage) {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestProbeAndHealthz(t *testing.T) {
	t.Parallel()
	srv := &Server{
		Dial: func(context.Context, string, string) (net.Conn, error) {
			return nil, errors.New("connection refused")
		},
	}
	req := httptest.NewRequest(http.MethodGet, "/probe?ip=100.64.0.3&port=5173", nil)
	rec := httptest.NewRecorder()
	srv.ProbeHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("probe fail status = %d", rec.Code)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			conn, acceptErr := ln.Accept()
			if acceptErr != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	srv.Dial = func(ctx context.Context, network, address string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "tcp", ln.Addr().String())
	}
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	req = httptest.NewRequest(http.MethodGet, "/probe?ip="+host+"&port="+port, nil)
	rec = httptest.NewRecorder()
	srv.ProbeHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("probe ok status=%d body=%q", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec = httptest.NewRecorder()
	srv.ProbeHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("healthz not ready = %d", rec.Code)
	}
	srv.Ready.Store(true)
	rec = httptest.NewRecorder()
	srv.ProbeHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("healthz ready = %d", rec.Code)
	}
}
