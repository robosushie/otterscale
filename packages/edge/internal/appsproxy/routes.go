package appsproxy

import (
	"encoding/json"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
)

type Route struct {
	ID        string `json:"id"`
	Subdomain string `json:"subdomain"`
	IP        string `json:"ip"`
	Port      int    `json:"port"`
}

type File struct {
	BaseDomain string  `json:"baseDomain"`
	Routes     []Route `json:"routes"`
}

type Table struct {
	mu         sync.RWMutex
	baseDomain string
	byHost     map[string]Route
}

func PreferMeshIP(addrs []string) string {
	for _, addr := range addrs {
		if addr != "" && !strings.Contains(addr, ":") {
			return addr
		}
	}
	for _, addr := range addrs {
		if addr != "" {
			return addr
		}
	}
	return ""
}

func DialAddr(ip string, port int) string {
	return net.JoinHostPort(ip, strconv.Itoa(port))
}

func NormalizeHost(host string) string {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" {
		return ""
	}
	if parsed, _, err := net.SplitHostPort(h); err == nil {
		return strings.ToLower(parsed)
	}
	return h
}

func (t *Table) Load(path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			t.mu.Lock()
			t.baseDomain = ""
			t.byHost = map[string]Route{}
			t.mu.Unlock()
			return nil
		}
		return err
	}
	var file File
	if err := json.Unmarshal(raw, &file); err != nil {
		return err
	}
	next := make(map[string]Route, len(file.Routes))
	base := strings.ToLower(strings.TrimSpace(file.BaseDomain))
	for _, route := range file.Routes {
		if route.Subdomain == "" || route.IP == "" || route.Port < 1 || route.Port > 65535 {
			continue
		}
		host := strings.ToLower(route.Subdomain) + "." + base
		next[host] = route
	}
	t.mu.Lock()
	t.baseDomain = base
	t.byHost = next
	t.mu.Unlock()
	return nil
}

func (t *Table) Lookup(host string) (Route, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	route, ok := t.byHost[NormalizeHost(host)]
	return route, ok
}
