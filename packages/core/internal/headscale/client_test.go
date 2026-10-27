package headscale

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRemoveNodeExpiresBeforeDelete(t *testing.T) {
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	prev := removeNodeSettle
	removeNodeSettle = 0
	t.Cleanup(func() { removeNodeSettle = prev })

	client := &Client{BaseURL: srv.URL, APIKey: "test", HTTP: srv.Client()}
	if err := client.RemoveNode(context.Background(), "7"); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 2 || calls[0] != "POST /api/v1/node/7/expire" || calls[1] != "DELETE /api/v1/node/7" {
		t.Fatalf("calls %v", calls)
	}
}

func TestRemoveNodeStopsWhenExpireFails(t *testing.T) {
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		http.Error(w, "no", http.StatusBadGateway)
	}))
	defer srv.Close()

	prev := removeNodeSettle
	removeNodeSettle = time.Hour
	t.Cleanup(func() { removeNodeSettle = prev })

	client := &Client{BaseURL: srv.URL, APIKey: "test", HTTP: srv.Client()}
	if err := client.RemoveNode(context.Background(), "7"); err == nil {
		t.Fatal("expected expire to fail")
	}
	if len(calls) != 1 || calls[0] != "POST /api/v1/node/7/expire" {
		t.Fatalf("calls %v", calls)
	}
}

func TestRemoveNodeLeavesNodeWhenContextEnds(t *testing.T) {
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	prev := removeNodeSettle
	removeNodeSettle = time.Hour
	t.Cleanup(func() { removeNodeSettle = prev })

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	base := srv.Client().Transport
	if base == nil {
		base = http.DefaultTransport
	}
	client := &Client{
		BaseURL: srv.URL,
		APIKey:  "test",
		HTTP: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			res, err := base.RoundTrip(r)
			if err == nil && r.Method == http.MethodPost {
				cancel()
			}
			return res, err
		})},
	}
	if err := client.RemoveNode(ctx, "7"); err != context.Canceled {
		t.Fatalf("err %v", err)
	}
	if len(calls) != 1 || calls[0] != "POST /api/v1/node/7/expire" {
		t.Fatalf("calls %v", calls)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}
