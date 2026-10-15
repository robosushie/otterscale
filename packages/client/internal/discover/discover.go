// Package discover learns console, API, and Headscale addresses from api.<domain>
// and waits for a browser approval to hand back a one-time auth key.
// The key is returned to the caller and is never written to disk here.
package discover

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// PollInterval is how often the desktop asks whether the browser approved the link.
var PollInterval = 2 * time.Second

// Endpoints are the addresses the desktop stores after a successful bootstrap.
type Endpoints struct {
	ConsoleURL  string `json:"consoleUrl"`
	APIURL      string `json:"apiUrl"`
	LoginServer string `json:"loginServer"`
}

// Link is a short-lived approval request.
type Link struct {
	Code       string `json:"code"`
	ApproveURL string `json:"approveUrl"`
}

// NormalizeDomain accepts a hostname such as otterscale.example.
func NormalizeDomain(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.Trim(raw, "/")
	if i := strings.IndexAny(raw, "/"); i >= 0 {
		raw = raw[:i]
	}
	if raw == "" || strings.ContainsAny(raw, " :") {
		return "", errors.New("enter a base domain such as otterscale.example")
	}
	return raw, nil
}

// APIBase is https://api.<domain>.
func APIBase(domain string) string {
	return "https://api." + domain
}

// FetchBootstrap calls GET /api/client/bootstrap on apiBase.
func FetchBootstrap(ctx context.Context, apiBase string) (Endpoints, error) {
	var ends Endpoints
	base := strings.TrimRight(apiBase, "/")
	if err := getJSON(ctx, base+"/api/client/bootstrap", &ends); err != nil {
		return Endpoints{}, err
	}
	if ends.APIURL == "" {
		ends.APIURL = base
	}
	if ends.ConsoleURL == "" || ends.APIURL == "" || ends.LoginServer == "" {
		return Endpoints{}, errors.New("the server did not return console, API, and Headscale addresses")
	}
	return ends, nil
}

// StartLink asks the API for a device-link code.
func StartLink(ctx context.Context, apiBase string) (Link, error) {
	var link Link
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiBase, "/")+"/api/client/link", nil)
	if err != nil {
		return Link{}, err
	}
	if err := doJSON(req, &link); err != nil {
		return Link{}, err
	}
	if link.Code == "" || link.ApproveURL == "" {
		return Link{}, errors.New("the server did not return a sign-in link")
	}
	return link, nil
}

// Approval is the one-time join material. Neither value is written to disk here.
type Approval struct {
	Key        string
	Enrollment string
}

// ErrDeviceGone means the console removed or disabled this computer.
var ErrDeviceGone = errors.New("this computer was removed")

// WaitForKey polls until the console approves the code or ctx ends.
func WaitForKey(ctx context.Context, apiBase, code string) (Approval, error) {
	url := strings.TrimRight(apiBase, "/") + "/api/client/link/" + code
	ticker := time.NewTicker(PollInterval)
	defer ticker.Stop()
	for {
		approval, done, err := pollOnce(ctx, url)
		if err != nil {
			return Approval{}, err
		}
		if done {
			return approval, nil
		}
		select {
		case <-ctx.Done():
			return Approval{}, errors.New("sign-in was not approved")
		case <-ticker.C:
		}
	}
}

func pollOnce(ctx context.Context, url string) (Approval, bool, error) {
	var body struct {
		Status     string `json:"status"`
		Key        string `json:"key"`
		Enrollment string `json:"enrollment"`
	}
	if err := getJSON(ctx, url, &body); err != nil {
		return Approval{}, false, err
	}
	switch body.Status {
	case "pending":
		return Approval{}, false, nil
	case "approved":
		if body.Key == "" || body.Enrollment == "" {
			return Approval{}, false, errors.New("this sign-in was already used")
		}
		return Approval{Key: body.Key, Enrollment: body.Enrollment}, true, nil
	case "expired":
		return Approval{}, false, errors.New("the sign-in request expired")
	default:
		return Approval{}, false, fmt.Errorf("unexpected sign-in status %q", body.Status)
	}
}

// Enroll exchanges the enrollment secret and this computer's addresses for a device token.
func Enroll(ctx context.Context, apiBase, enrollment string, addresses []string) (string, error) {
	payload, err := json.Marshal(map[string]any{"enrollment": enrollment, "addresses": addresses})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiBase, "/")+"/api/client/device", strings.NewReader(string(payload)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	var body struct {
		Token string `json:"token"`
		Error string `json:"error"`
		Retry bool   `json:"retry"`
	}
	status, err := doStatus(req, &body)
	if err != nil {
		return "", err
	}
	if status == http.StatusConflict && body.Retry {
		return "", &retryError{msg: body.Error}
	}
	if status < 200 || status >= 300 {
		if body.Error == "" {
			body.Error = http.StatusText(status)
		}
		return "", errors.New(body.Error)
	}
	if body.Token == "" {
		return "", errors.New("the server did not return a device token")
	}
	return body.Token, nil
}

// Retryable reports whether enroll should be tried again while Headscale registers the node.
func Retryable(err error) bool {
	var retry *retryError
	return errors.As(err, &retry)
}

type retryError struct{ msg string }

func (e *retryError) Error() string {
	if e.msg == "" {
		return "this computer has not registered yet"
	}
	return e.msg
}

// CheckDevice reports whether this computer is still present and enabled.
// A network failure is returned as an error. ErrDeviceGone means the console rejected it.
func CheckDevice(ctx context.Context, apiBase, token string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(apiBase, "/")+"/api/client/device", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	status, err := doStatus(req, &struct{}{})
	if err != nil {
		return err
	}
	switch status {
	case http.StatusOK:
		return nil
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusGone:
		return ErrDeviceGone
	default:
		return fmt.Errorf("device check failed: %s", http.StatusText(status))
	}
}

func doStatus(req *http.Request, dest any) (int, error) {
	req.Header.Set("Accept", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("could not reach the Otterscale API: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return 0, err
	}
	if len(raw) > 0 && dest != nil {
		_ = json.Unmarshal(raw, dest)
	}
	return res.StatusCode, nil
}

func getJSON(ctx context.Context, url string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	return doJSON(req, dest)
}

func doJSON(req *http.Request, dest any) error {
	req.Header.Set("Accept", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach the Otterscale API: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var body struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(raw, &body)
		if body.Error == "" {
			body.Error = res.Status
		}
		return errors.New(body.Error)
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return errors.New("the Otterscale API returned an unexpected response")
	}
	return nil
}
