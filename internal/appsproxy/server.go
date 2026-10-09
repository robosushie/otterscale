package appsproxy

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

const (
	UnknownAppMessage = "Unknown app. Publish it in Otterscale Network Apps."
	OfflineMessage    = "This machine is offline or the published app is unreachable."
)

type DialContextFunc func(ctx context.Context, network, address string) (net.Conn, error)

type Server struct {
	Table *Table
	Dial  DialContextFunc
	Ready atomic.Bool
}

func (s *Server) AppHandler() http.Handler {
	return http.HandlerFunc(s.serveApp)
}

func (s *Server) ProbeHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/probe", s.serveProbe)
	mux.HandleFunc("/healthz", s.serveHealthz)
	return mux
}

func (s *Server) serveApp(w http.ResponseWriter, r *http.Request) {
	route, ok := s.Table.Lookup(r.Host)
	if !ok {
		http.Error(w, UnknownAppMessage, http.StatusNotFound)
		return
	}
	target := &url.URL{
		Scheme: "http",
		Host:   DialAddr(route.IP, route.Port),
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Transport = &http.Transport{
		DialContext: s.Dial,
		// Short enough that an offline node returns 502 instead of hanging Chrome.
		ResponseHeaderTimeout: 15 * time.Second,
	}
	proxy.ErrorHandler = func(rw http.ResponseWriter, _ *http.Request, _ error) {
		http.Error(rw, OfflineMessage, http.StatusBadGateway)
	}
	proxy.ServeHTTP(w, r)
}

func (s *Server) serveProbe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ip := strings.TrimSpace(r.URL.Query().Get("ip"))
	port, err := strconv.Atoi(r.URL.Query().Get("port"))
	if err != nil || ip == "" || port < 1 || port > 65535 {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, "invalid ip or port")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	conn, dialErr := s.Dial(ctx, "tcp", DialAddr(ip, port))
	if dialErr != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		msg := dialErr.Error()
		if msg == "" {
			msg = "connection refused"
		}
		_, _ = io.WriteString(w, msg)
		return
	}
	_ = conn.Close()
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok")
}

func (s *Server) serveHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.Ready.Load() {
		http.Error(w, "tsnet not ready", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok")
}
