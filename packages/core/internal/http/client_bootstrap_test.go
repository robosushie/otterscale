package httpapi

import "testing"

func TestBootstrapEndpoints(t *testing.T) {
	t.Setenv("OTTERSCALE_DOMAIN", "https://otterscale.example/")
	t.Setenv("AUTH_URL", "")
	t.Setenv("HEADSCALE_PUBLIC_URL", "https://hs.otterscale.example")
	got := bootstrapEndpoints()
	if got.ConsoleURL != "https://console.otterscale.example" {
		t.Fatalf("console %q", got.ConsoleURL)
	}
	if got.APIURL != "https://api.otterscale.example" {
		t.Fatalf("api %q", got.APIURL)
	}
	if got.LoginServer != "https://hs.otterscale.example" {
		t.Fatalf("login %q", got.LoginServer)
	}
}

func TestBootstrapDerivesAPIFromConsoleHost(t *testing.T) {
	t.Setenv("OTTERSCALE_DOMAIN", "")
	t.Setenv("AUTH_URL", "https://console.localhost")
	t.Setenv("HEADSCALE_PUBLIC_URL", "https://hs.localhost")
	got := bootstrapEndpoints()
	if got.ConsoleURL != "https://console.localhost" || got.APIURL != "https://api.localhost" || got.LoginServer != "https://hs.localhost" {
		t.Fatalf("%#v", got)
	}
}

func TestBootstrapPrefersAuthURL(t *testing.T) {
	t.Setenv("OTTERSCALE_DOMAIN", "otterscale.example")
	t.Setenv("AUTH_URL", "https://console.custom.example/")
	t.Setenv("HEADSCALE_PUBLIC_URL", "")
	got := bootstrapEndpoints()
	if got.ConsoleURL != "https://console.custom.example" {
		t.Fatalf("console %q", got.ConsoleURL)
	}
	if got.LoginServer != "https://otterscale.example" {
		t.Fatalf("login %q", got.LoginServer)
	}
}
