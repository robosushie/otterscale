package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
	"otterscale/core/internal/db"
	"otterscale/core/internal/store"
)

func TestSetupToken(t *testing.T) {
	api := newSetupAPI(t)
	if status := postSetup(t, api, "owner", "", "192.0.2.1:1234"); status != http.StatusForbidden {
		t.Fatalf("unset token status %d", status)
	}
	t.Setenv("AUTH_SETUP_TOKEN", "correct-token")
	if status := postSetup(t, api, "owner", "wrong-token", "192.0.2.1:1234"); status != http.StatusForbidden {
		t.Fatalf("wrong token status %d", status)
	}
	if status := postSetup(t, api, "owner", "correct-token", "192.0.2.1:1234"); status != http.StatusOK {
		t.Fatalf("correct token status %d", status)
	}
	if status := postSetup(t, api, "second", "correct-token", "192.0.2.1:1234"); status != http.StatusConflict {
		t.Fatalf("second owner status %d", status)
	}
	var users int
	if err := api.Store.DB.QueryRow(context.Background(), `SELECT COUNT(*) FROM "User"`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 1 {
		t.Fatalf("users %d", users)
	}
}

func TestSetupOpenOnlyOnLoopback(t *testing.T) {
	api := newSetupAPI(t)
	t.Setenv("AUTH_SETUP_TOKEN", "")
	t.Setenv("AUTH_SETUP_OPEN", "1")
	if status := postSetup(t, api, "owner", "", "172.18.0.3:4000"); status != http.StatusForbidden {
		t.Fatalf("bridge status %d", status)
	}
	if status := postSetup(t, api, "owner", "", "127.0.0.1:1234"); status != http.StatusOK {
		t.Fatalf("loopback status %d", status)
	}
}

func newSetupAPI(t *testing.T) *API {
	t.Helper()
	t.Setenv("AUTH_SECRET", strings.Repeat("s", 32))
	t.Setenv("OTTERSCALE_DATA_DIR", t.TempDir())
	t.Setenv("AUTH_SETUP_TOKEN", "")
	t.Setenv("AUTH_SETUP_OPEN", "")
	ctx := context.Background()
	database, err := db.Open(ctx, "", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	return New(store.New(database), strings.Repeat("s", 32))
}

func postSetup(t *testing.T, api *API, username, token, remote string) int {
	t.Helper()
	key, err := totp.Generate(totp.GenerateOpts{Issuer: "Otterscale", AccountName: username, SecretSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	code, err := totp.GenerateCode(key.Secret(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(map[string]string{
		"username": username, "email": username + "@example.com",
		"password": "password1", "confirmPassword": "password1",
		"totpCode": code, "totpSecret": key.Secret(), "setupToken": token,
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(body))
	req.RemoteAddr = remote
	rec := httptest.NewRecorder()
	api.setup(rec, req)
	return rec.Code
}
