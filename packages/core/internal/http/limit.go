package httpapi

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const tooManyAttempts = "Too many attempts. Try again later."

type slidingLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func newSlidingLimiter() *slidingLimiter {
	return &slidingLimiter{hits: map[string][]time.Time{}}
}

func (l *slidingLimiter) allow(key string, n int, window time.Duration) bool {
	now := time.Now()
	cutoff := now.Add(-window)
	l.mu.Lock()
	defer l.mu.Unlock()
	kept := l.hits[key][:0]
	for _, at := range l.hits[key] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) >= n {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	if len(l.hits) > 4096 {
		for name, stamps := range l.hits {
			if len(stamps) == 0 || stamps[len(stamps)-1].Before(cutoff) {
				delete(l.hits, name)
			}
		}
	}
	return true
}

func (a *API) limitClient(name string, n int, window time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.limits.allow(name+":ip:"+clientIP(r), n, window) {
			fail(w, http.StatusTooManyRequests, tooManyAttempts)
			return
		}
		next(w, r)
	}
}

func (a *API) limitSignin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.limits.allow("signin:ip:"+clientIP(r), 20, 15*time.Minute) {
			fail(w, http.StatusTooManyRequests, tooManyAttempts)
			return
		}
		if user := usernameFromBody(r); user != "" && !a.limits.allow("signin:user:"+user, 5, 15*time.Minute) {
			fail(w, http.StatusTooManyRequests, tooManyAttempts)
			return
		}
		next(w, r)
	}
}

func usernameFromBody(r *http.Request) string {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	r.Body = io.NopCloser(bytes.NewReader(raw))
	if err != nil {
		return ""
	}
	var body struct {
		Username string `json:"username"`
	}
	if json.Unmarshal(raw, &body) != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(body.Username))
}

// clientIP uses the TCP peer. When that peer is loopback or private, the last
// X-Forwarded-For hop is the address a reverse proxy such as Caddy appended.
func clientIP(r *http.Request) string {
	host := remoteHost(r.RemoteAddr)
	ip := net.ParseIP(host)
	if ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
		if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			if last := strings.TrimSpace(parts[len(parts)-1]); last != "" {
				return last
			}
		}
	}
	if host == "" {
		return "unknown"
	}
	return host
}

func remoteHost(remote string) string {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return remote
	}
	return host
}

func setupAllowed(r *http.Request, provided string) bool {
	if os.Getenv("AUTH_SETUP_OPEN") == "1" && tcpLoopback(r) {
		return true
	}
	expected := strings.TrimSpace(os.Getenv("AUTH_SETUP_TOKEN"))
	if expected == "" {
		return false
	}
	return tokenEqual(provided, expected)
}

func tcpLoopback(r *http.Request) bool {
	ip := net.ParseIP(remoteHost(r.RemoteAddr))
	return ip != nil && ip.IsLoopback()
}

func tokenEqual(got, want string) bool {
	sumGot := sha256.Sum256([]byte(got))
	sumWant := sha256.Sum256([]byte(want))
	return subtle.ConstantTimeCompare(sumGot[:], sumWant[:]) == 1
}
