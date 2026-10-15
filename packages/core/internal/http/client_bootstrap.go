package httpapi

import (
	"net/http"
	"os"
	"strings"
)

type clientEndpoints struct {
	ConsoleURL  string `json:"consoleUrl"`
	APIURL      string `json:"apiUrl"`
	LoginServer string `json:"loginServer"`
}

func (a *API) clientBootstrap(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, bootstrapEndpoints())
}

func bootstrapEndpoints() clientEndpoints {
	domain := bareDomain(os.Getenv("OTTERSCALE_DOMAIN"))
	console := strings.TrimRight(strings.TrimSpace(os.Getenv("AUTH_URL")), "/")
	if domain == "" {
		domain = domainFromConsole(console)
	}
	if console == "" && domain != "" {
		console = "https://console." + domain
	}
	return clientEndpoints{
		ConsoleURL:  console,
		APIURL:      apiURLFor(domain, console),
		LoginServer: loginServer(),
	}
}

func domainFromConsole(console string) string {
	host := bareDomain(console)
	const prefix = "console."
	if strings.HasPrefix(host, prefix) && len(host) > len(prefix) {
		return host[len(prefix):]
	}
	return ""
}

func apiURLFor(domain, console string) string {
	if domain == "" {
		return ""
	}
	scheme := "https"
	if strings.HasPrefix(strings.ToLower(console), "http://") {
		scheme = "http"
	}
	return scheme + "://api." + domain
}

func bareDomain(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.Trim(raw, "/")
	if i := strings.IndexAny(raw, "/"); i >= 0 {
		raw = raw[:i]
	}
	return raw
}
