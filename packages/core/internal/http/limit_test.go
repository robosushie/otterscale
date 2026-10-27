package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSlidingWindow(t *testing.T) {
	limit := newSlidingLimiter()
	for i := 0; i < 3; i++ {
		if !limit.allow("k", 3, time.Minute) {
			t.Fatal("expected room in the window")
		}
	}
	if limit.allow("k", 3, time.Minute) {
		t.Fatal("window should be full")
	}
	if !limit.allow("other", 3, time.Minute) {
		t.Fatal("a second key has its own window")
	}
}

func TestClientIP(t *testing.T) {
	behind := httptest.NewRequest(http.MethodPost, "/", nil)
	behind.RemoteAddr = "10.0.0.8:4000"
	behind.Header.Set("X-Forwarded-For", "198.51.100.4, 203.0.113.9")
	if got := clientIP(behind); got != "203.0.113.9" {
		t.Fatalf("proxy hop %q", got)
	}
	direct := httptest.NewRequest(http.MethodPost, "/", nil)
	direct.RemoteAddr = "198.51.100.20:443"
	direct.Header.Set("X-Forwarded-For", "203.0.113.9")
	if got := clientIP(direct); got != "198.51.100.20" {
		t.Fatalf("public peer %q", got)
	}
	loop := httptest.NewRequest(http.MethodPost, "/", nil)
	loop.RemoteAddr = "127.0.0.1:1234"
	if !tcpLoopback(loop) {
		t.Fatal("expected loopback")
	}
	docker := httptest.NewRequest(http.MethodPost, "/", nil)
	docker.RemoteAddr = "172.18.0.3:4000"
	if tcpLoopback(docker) {
		t.Fatal("docker bridge is not loopback")
	}
}
