package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"otterscale/core/internal/headscale"
)

const linkTTL = 10 * time.Minute

type deviceLink struct {
	expires        time.Time
	key            string
	enrollment     string
	enrollmentHash string
	approved       bool
	enrollmentUsed bool
}

type linkBook struct {
	mu    sync.Mutex
	items map[string]*deviceLink
}

func newLinkBook() *linkBook {
	return &linkBook{items: map[string]*deviceLink{}}
}

func (a *API) linkBook() *linkBook {
	a.linkOnce.Do(func() { a.links = newLinkBook() })
	return a.links
}

func (b *linkBook) create(now time.Time) (string, time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for code, item := range b.items {
		if now.After(item.expires) {
			delete(b.items, code)
		}
	}
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	code := hex.EncodeToString(buf)
	expires := now.Add(linkTTL)
	b.items[code] = &deviceLink{expires: expires}
	return code, expires
}

func (b *linkBook) approve(code, key string, now time.Time) error {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	enrollment := hex.EncodeToString(buf)
	b.mu.Lock()
	defer b.mu.Unlock()
	item, ok := b.items[code]
	if !ok || now.After(item.expires) {
		return errLinkGone
	}
	if item.approved {
		return errLinkUsed
	}
	item.approved = true
	item.key = key
	item.enrollment = enrollment
	item.enrollmentHash = secretHash(enrollment)
	return nil
}

func (b *linkBook) poll(code string, now time.Time) (string, string, string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	item, ok := b.items[code]
	if !ok || now.After(item.expires) {
		delete(b.items, code)
		return "expired", "", ""
	}
	if !item.approved {
		return "pending", "", ""
	}
	key := item.key
	enrollment := item.enrollment
	item.key = ""
	item.enrollment = ""
	return "approved", key, enrollment
}

func (b *linkBook) enrollmentItem(raw string, now time.Time) (*deviceLink, error) {
	sum := secretHash(raw)
	for _, item := range b.items {
		if item.enrollmentHash == "" || item.enrollmentHash != sum {
			continue
		}
		if now.After(item.expires) {
			return nil, errLinkGone
		}
		if item.enrollmentUsed {
			return nil, errLinkUsed
		}
		return item, nil
	}
	return nil, errLinkGone
}

func (b *linkBook) enrollmentReady(raw string, now time.Time) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, err := b.enrollmentItem(raw, now)
	return err
}

func (b *linkBook) consumeEnrollment(raw string, now time.Time) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	item, err := b.enrollmentItem(raw, now)
	if err != nil {
		return err
	}
	item.enrollmentUsed = true
	return nil
}

func secretHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

type linkError string

func (e linkError) Error() string { return string(e) }

const (
	errLinkGone linkError = "this sign-in request expired"
	errLinkUsed linkError = "this sign-in request was already approved"
)

func (a *API) createClientLink(w http.ResponseWriter, r *http.Request) {
	ends := bootstrapEndpoints()
	if ends.ConsoleURL == "" {
		fail(w, http.StatusServiceUnavailable, "console URL is not configured")
		return
	}
	code, expires := a.linkBook().create(time.Now())
	writeJSON(w, http.StatusOK, map[string]string{
		"code":       code,
		"approveUrl": ends.ConsoleURL + "/link?code=" + code,
		"expires":    expires.UTC().Format(time.RFC3339),
	})
}

func (a *API) pollClientLink(w http.ResponseWriter, r *http.Request) {
	status, key, enrollment := a.linkBook().poll(r.PathValue("code"), time.Now())
	body := map[string]string{"status": status}
	if key != "" {
		body["key"] = key
	}
	if enrollment != "" {
		body["enrollment"] = enrollment
	}
	writeJSON(w, http.StatusOK, body)
}

func (a *API) approveClientLink(w http.ResponseWriter, r *http.Request) {
	authz, ok := a.require(w, r, "network.manage")
	if !ok {
		return
	}
	var body struct {
		WorkspaceIDs []string `json:"workspaceIds"`
		TagIDs       []string `json:"tagIds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if len(body.WorkspaceIDs) == 0 {
		fail(w, http.StatusBadRequest, "choose a workspace")
		return
	}
	client := headscale.FromEnv()
	if client == nil {
		fail(w, http.StatusServiceUnavailable, "Headscale is not configured")
		return
	}
	tags := a.aclTags(r.Context(), body.WorkspaceIDs, body.TagIDs)
	if len(tags) == 0 {
		fail(w, http.StatusBadRequest, "choose a workspace")
		return
	}
	key, err := client.CreatePreAuthKey(r.Context(), "tagged-devices", time.Now().Add(time.Hour), tags)
	if err != nil {
		fail(w, http.StatusBadGateway, headscale.FormatError(err))
		return
	}
	if err := a.linkBook().approve(r.PathValue("code"), key, time.Now()); err != nil {
		fail(w, http.StatusGone, err.Error())
		return
	}
	org, _ := a.Store.DefaultOrg(r.Context())
	_ = a.Store.Audit(r.Context(), org.ID, authz.UserID, "authkey.created", "NETWORK", "preauthkey", "", map[string]any{"tags": tags, "deviceLink": true})
	a.Live.Publish("machines")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
