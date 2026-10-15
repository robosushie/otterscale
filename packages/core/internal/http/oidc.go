package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"

	"golang.org/x/oauth2"
)

func (a *API) oidcStart(w http.ResponseWriter, r *http.Request) {
	cfg, err := a.oidcConfig(r.Context(), r)
	if err != nil {
		fail(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	state := randomToken()
	verifier := oauth2.GenerateVerifier()
	secure := strings.HasPrefix(strings.ToLower(os.Getenv("AUTH_URL")), "https://")
	http.SetCookie(w, &http.Cookie{Name: "otterscale_oidc_state", Value: state, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: 600})
	http.SetCookie(w, &http.Cookie{Name: "otterscale_oidc_verifier", Value: verifier, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: 600})
	if next := safeNext(r.URL.Query().Get("next")); next != "" {
		http.SetCookie(w, &http.Cookie{Name: "otterscale_oidc_next", Value: url.QueryEscape(next), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: 600})
	}
	http.Redirect(w, r, cfg.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func (a *API) oidcCallback(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, "/signin?error=oidc", http.StatusFound)
		return
	}
	stateCookie, err := r.Cookie("otterscale_oidc_state")
	verifier, verr := r.Cookie("otterscale_oidc_verifier")
	if err != nil || verr != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		fail(w, http.StatusBadRequest, "OIDC state did not match.")
		return
	}
	cfg, err := a.oidcConfig(r.Context(), r)
	if err != nil {
		fail(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	token, err := cfg.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.VerifierOption(verifier.Value))
	if err != nil {
		fail(w, http.StatusUnauthorized, "OIDC token exchange failed.")
		return
	}
	info, err := fetchUserInfo(r.Context(), cfg, token)
	if err != nil {
		fail(w, http.StatusUnauthorized, err.Error())
		return
	}
	userID, err := a.Store.UpsertOIDCUser(r.Context(), info.Sub, info.Email, info.Name)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if user, err := a.Store.UserByID(r.Context(), userID); err == nil && user.LoginDisabled {
		http.Redirect(w, r, "/signin?error=disabled", http.StatusFound)
		return
	}
	if has, _ := a.Store.HasOwner(r.Context()); !has {
		_ = a.Store.BootstrapOwner(r.Context(), userID, info.Email)
	}
	clear := func(name string) {
		http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	}
	clear("otterscale_oidc_state")
	clear("otterscale_oidc_verifier")
	dest := "/machines"
	if next, err := r.Cookie("otterscale_oidc_next"); err == nil {
		decoded, _ := url.QueryUnescape(next.Value)
		if safe := safeNext(decoded); safe != "" {
			dest = safe
		}
	}
	clear("otterscale_oidc_next")
	a.setSession(w, r, userID)
	http.Redirect(w, r, dest, http.StatusFound)
}

func safeNext(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") || strings.ContainsAny(raw, "\\\r\n") {
		return ""
	}
	return raw
}

type oidcInfo struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type oidcEndpoints struct {
	oauth2.Endpoint
	Userinfo string
}

func (a *API) oidcConfig(ctx context.Context, r *http.Request) (*oauth2.Config, error) {
	issuer := strings.TrimRight(strings.TrimSpace(os.Getenv("AUTH_OIDC_ISSUER")), "/")
	clientID := strings.TrimSpace(os.Getenv("AUTH_OIDC_CLIENT_ID"))
	secret := strings.TrimSpace(os.Getenv("AUTH_OIDC_CLIENT_SECRET"))
	if issuer == "" || clientID == "" || secret == "" {
		return nil, errOIDCDisabled
	}
	endpoints, err := discoverOIDC(ctx, issuer)
	if err != nil {
		return nil, err
	}
	return &oauth2.Config{
		ClientID: clientID, ClientSecret: secret,
		Endpoint:    endpoints.Endpoint,
		RedirectURL: oidcRedirect(r),
		Scopes:      []string{"openid", "email", "profile"},
	}, nil
}

var errOIDCDisabled = errString("OIDC is not configured")

type errString string

func (e errString) Error() string { return string(e) }

func discoverOIDC(ctx context.Context, issuer string) (oidcEndpoints, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, issuer+"/.well-known/openid-configuration", nil)
	if err != nil {
		return oidcEndpoints{}, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return oidcEndpoints{}, err
	}
	defer res.Body.Close()
	var doc struct {
		AuthorizationEndpoint string `json:"authorization_endpoint"`
		TokenEndpoint         string `json:"token_endpoint"`
		UserinfoEndpoint      string `json:"userinfo_endpoint"`
	}
	if err := json.NewDecoder(res.Body).Decode(&doc); err != nil {
		return oidcEndpoints{}, err
	}
	if doc.AuthorizationEndpoint == "" || doc.TokenEndpoint == "" || doc.UserinfoEndpoint == "" {
		return oidcEndpoints{}, errString("OIDC discovery document is incomplete")
	}
	return oidcEndpoints{Endpoint: oauth2.Endpoint{AuthURL: doc.AuthorizationEndpoint, TokenURL: doc.TokenEndpoint}, Userinfo: doc.UserinfoEndpoint}, nil
}

func fetchUserInfo(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (oidcInfo, error) {
	endpoints, err := discoverOIDC(ctx, strings.TrimRight(strings.TrimSpace(os.Getenv("AUTH_OIDC_ISSUER")), "/"))
	if err != nil {
		return oidcInfo{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoints.Userinfo, nil)
	if err != nil {
		return oidcInfo{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	res, err := cfg.Client(ctx, token).Do(req)
	if err != nil {
		return oidcInfo{}, err
	}
	defer res.Body.Close()
	var info oidcInfo
	if err := json.NewDecoder(res.Body).Decode(&info); err != nil {
		return oidcInfo{}, err
	}
	if info.Email == "" || info.Sub == "" {
		return oidcInfo{}, errString("OIDC account is missing email or subject")
	}
	return info, nil
}

func oidcRedirect(r *http.Request) string {
	if base := strings.TrimRight(strings.TrimSpace(os.Getenv("AUTH_URL")), "/"); base != "" {
		return base + "/api/auth/oidc/callback"
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	return scheme + "://" + host + "/api/auth/oidc/callback"
}

func randomToken() string {
	buf := make([]byte, 24)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}
