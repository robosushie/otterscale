package apps

import (
	"errors"
	"net"
	"net/url"
	"os"
	"regexp"
	"strings"
)

var errSubdomain = errors.New("Subdomain is not allowed")

var labelRE = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

var reservedLabels = map[string]struct{}{
	"www": {}, "api": {}, "admin": {}, "auth": {}, "login": {}, "mail": {},
	"console": {}, "sso": {}, "oauth": {}, "ftp": {}, "localhost": {},
	"otterscale": {}, "account": {}, "support": {}, "cdn": {}, "static": {},
}

var subdomainClean = regexp.MustCompile(`[^a-z0-9-]+`)

func CleanSubdomain(raw string) string {
	return strings.Trim(subdomainClean.ReplaceAllString(strings.ToLower(raw), "-"), "-")
}

func ConsoleHost() string {
	return hostname(os.Getenv("AUTH_URL"))
}

// ValidateSubdomain rejects labels that are not DNS-safe, reserved, or equal to the console host.
func ValidateSubdomain(label, appsDomain, consoleHost string) error {
	label = strings.ToLower(strings.TrimSpace(label))
	if !labelRE.MatchString(label) || strings.HasPrefix(label, "xn--") {
		return errSubdomain
	}
	if _, reserved := reservedLabels[label]; reserved {
		return errSubdomain
	}
	host := hostname(consoleHost)
	if first := firstLabel(host); first != "" && label == first {
		return errSubdomain
	}
	appsDomain = strings.Trim(strings.ToLower(strings.TrimSpace(appsDomain)), ".")
	if host != "" && appsDomain != "" && strings.EqualFold(label+"."+appsDomain, host) {
		return errSubdomain
	}
	return nil
}

func hostname(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "://") {
		parsed, err := url.Parse(raw)
		if err != nil {
			return ""
		}
		return strings.ToLower(parsed.Hostname())
	}
	if host, _, err := net.SplitHostPort(raw); err == nil {
		raw = host
	}
	return strings.ToLower(strings.Trim(raw, "."))
}

func firstLabel(host string) string {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), ".")
	if host == "" {
		return ""
	}
	label, _, _ := strings.Cut(host, ".")
	return label
}
