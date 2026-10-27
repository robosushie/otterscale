package httpapi

import "testing"

func TestOIDCRedirectRequiresAuthURL(t *testing.T) {
	t.Setenv("AUTH_URL", "")
	if _, err := oidcRedirect(); err == nil {
		t.Fatal("expected AUTH_URL to be required")
	}
	t.Setenv("AUTH_URL", "https://console.example/")
	got, err := oidcRedirect()
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://console.example/api/auth/oidc/callback" {
		t.Fatalf("redirect %q", got)
	}
}
