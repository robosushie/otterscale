package apps

import "testing"

func TestValidateSubdomain(t *testing.T) {
	t.Setenv("AUTH_URL", "https://portal.example.com")
	cases := []struct {
		label  string
		domain string
		ok     bool
	}{
		{"notes", "apps.example.com", true},
		{"www", "apps.example.com", false},
		{"login", "apps.example.com", false},
		{"portal", "apps.example.com", false},
		{"console", "example.com", false},
		{"xn--notes", "apps.example.com", false},
		{"notes", "example.com", true},
		{"portal", "example.com", false},
	}
	for _, tc := range cases {
		err := ValidateSubdomain(tc.label, tc.domain, ConsoleHost())
		if tc.ok && err != nil {
			t.Fatalf("%s on %s: %v", tc.label, tc.domain, err)
		}
		if !tc.ok && err == nil {
			t.Fatalf("%s on %s should be rejected", tc.label, tc.domain)
		}
	}
	if CleanSubdomain("Hello_World") != "hello-world" {
		t.Fatal(CleanSubdomain("Hello_World"))
	}
}
