package discover

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFetchBootstrapFillsEmptyAPIURL(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/client/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"consoleUrl":"https://console.localhost","apiUrl":"","loginServer":"https://hs.localhost"}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	got, err := FetchBootstrap(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if got.APIURL != srv.URL || got.ConsoleURL != "https://console.localhost" {
		t.Fatalf("%#v", got)
	}
}

func TestDeleteDeviceRemovesTheComputer(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("DELETE /api/client/device", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	if err := DeleteDevice(context.Background(), srv.URL, "secret"); err != nil {
		t.Fatal(err)
	}
	err := DeleteDevice(context.Background(), srv.URL, "other")
	if !errors.Is(err, ErrDeviceGone) {
		t.Fatalf("err %v", err)
	}
}

func TestCheckDeviceRejectsRemoval(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/client/device", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusForbidden)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	err := CheckDevice(context.Background(), srv.URL, "secret")
	if !errors.Is(err, ErrDeviceGone) {
		t.Fatalf("err %v", err)
	}
}

func TestNormalizeDomain(t *testing.T) {
	got, err := NormalizeDomain("https://otterscale.example/console")
	if err != nil || got != "otterscale.example" {
		t.Fatalf("got %q err %v", got, err)
	}
	if _, err := NormalizeDomain("not a domain"); err == nil {
		t.Fatal("expected error")
	}
}

func TestLinkJoin(t *testing.T) {
	key := "tskey-auth-from-server"
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/client/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"consoleUrl":"https://console.example","apiUrl":"https://api.example","loginServer":"https://hs.example"}`))
	})
	mux.HandleFunc("POST /api/client/link", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":"abc","approveUrl":"https://console.example/link?code=abc"}`))
	})
	polls := 0
	mux.HandleFunc("GET /api/client/link/abc", func(w http.ResponseWriter, r *http.Request) {
		polls++
		w.Header().Set("Content-Type", "application/json")
		if polls < 2 {
			_, _ = w.Write([]byte(`{"status":"pending"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"approved","key":"` + key + `","enrollment":"enroll-once"}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	ctx := context.Background()
	ends, err := FetchBootstrap(ctx, srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if ends.LoginServer != "https://hs.example" || ends.ConsoleURL != "https://console.example" {
		t.Fatalf("%#v", ends)
	}
	link, err := StartLink(ctx, srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if link.ApproveURL != "https://console.example/link?code=abc" {
		t.Fatalf("approve %q", link.ApproveURL)
	}
	old := PollInterval
	PollInterval = 5 * time.Millisecond
	t.Cleanup(func() { PollInterval = old })
	got, err := WaitForKey(ctx, srv.URL, link.Code)
	if err != nil {
		t.Fatal(err)
	}
	if got.Key != key || got.Enrollment != "enroll-once" {
		t.Fatalf("%#v", got)
	}
}

func TestFetchNetworkUsesTheDeviceToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/client/network", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"workspaces":[{"id":"g1","name":"platform"}],"machines":[{"id":"m1","name":"robosushie","hostname":"robosushie","addresses":["100.64.0.2"],"online":true,"workspaceIds":["g1"]}],"apps":[{"id":"a1","subdomain":"notes","port":8080,"status":"ACTIVE","machine":"robosushie","workspaceIds":["g1"]}]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	got, err := FetchNetwork(context.Background(), srv.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Workspaces) != 1 || got.Workspaces[0].Name != "platform" || len(got.Machines) != 1 || len(got.Apps) != 1 {
		t.Fatalf("%#v", got)
	}
}
