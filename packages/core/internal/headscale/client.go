package headscale

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Error struct {
	Message string
	Status  int
	Body    string
}

func (e *Error) Error() string {
	if strings.TrimSpace(e.Body) == "" {
		return fmt.Sprintf("%s (%d)", e.Message, e.Status)
	}
	return fmt.Sprintf("%s (%d: %s)", e.Message, e.Status, strings.TrimSpace(e.Body))
}

func FormatError(err error) string {
	if err == nil {
		return ""
	}
	if hs, ok := err.(*Error); ok {
		return hs.Error()
	}
	return err.Error()
}

type Node struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Hostname  string   `json:"hostname"`
	Tags      []string `json:"tags"`
	Online    bool     `json:"online"`
	LastSeen  string   `json:"lastSeen,omitempty"`
	Addresses []string `json:"addresses"`
	UserName  string   `json:"userName,omitempty"`
}

type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

func FromEnv() *Client {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("HEADSCALE_INTERNAL_URL")), "/")
	key := strings.TrimSpace(os.Getenv("HEADSCALE_API_KEY"))
	if base == "" || key == "" {
		return nil
	}
	return &Client{BaseURL: base, APIKey: key, HTTP: &http.Client{Timeout: 20 * time.Second}}
}

func Configured() bool { return FromEnv() != nil }

func (c *Client) do(ctx context.Context, method, path string, body any) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return httpClient.Do(req)
}

func (c *Client) ListNodes(ctx context.Context) ([]Node, error) {
	res, err := c.do(ctx, http.MethodGet, "/api/v1/node", nil)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	rawBody, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return nil, &Error{Message: "Failed to list nodes", Status: res.StatusCode, Body: string(rawBody)}
	}
	var payload struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return nil, err
	}
	out := make([]Node, 0, len(payload.Nodes))
	for _, raw := range payload.Nodes {
		out = append(out, mapNode(raw))
	}
	return out, nil
}

func (c *Client) PutPolicy(ctx context.Context, hujson string) error {
	body := map[string]string{"policy": hujson}
	res, err := c.do(ctx, http.MethodPut, "/api/v1/policy", body)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 300 {
		return nil
	}
	res2, err := c.do(ctx, http.MethodPost, "/api/v1/policy", body)
	if err != nil {
		return err
	}
	defer res2.Body.Close()
	if res2.StatusCode >= 300 {
		b, _ := io.ReadAll(res2.Body)
		return &Error{Message: "Failed to apply policy", Status: res2.StatusCode, Body: string(b)}
	}
	return nil
}

func (c *Client) CreatePreAuthKey(ctx context.Context, user string, expiration time.Time, aclTags []string) (string, error) {
	if user == "" {
		user = "tagged-devices"
	}
	if expiration.IsZero() {
		expiration = time.Now().Add(24 * time.Hour)
	}
	res, err := c.do(ctx, http.MethodPost, "/api/v1/preauthkey", map[string]any{
		"user": user, "reusable": false, "ephemeral": false,
		"expiration": expiration.UTC().Format(time.RFC3339), "aclTags": aclTags,
	})
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", &Error{Message: "Failed to create preauth key", Status: res.StatusCode, Body: string(raw)}
	}
	var data struct {
		Key        string `json:"key"`
		PreAuthKey struct {
			Key string `json:"key"`
		} `json:"preAuthKey"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return "", err
	}
	if data.PreAuthKey.Key != "" {
		return data.PreAuthKey.Key, nil
	}
	if data.Key == "" {
		return "", &Error{Message: "No key in response", Status: 500}
	}
	return data.Key, nil
}

func (c *Client) ExpirePreAuthKey(ctx context.Context, key, user string) error {
	if user == "" {
		user = "tagged-devices"
	}
	res, err := c.do(ctx, http.MethodPost, "/api/v1/preauthkey/expire", map[string]string{"user": user, "key": key})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Message: "Failed to expire auth key", Status: res.StatusCode, Body: string(b)}
	}
	return nil
}

func (c *Client) RenameNode(ctx context.Context, nodeID, name string) error {
	path := "/api/v1/node/" + url.PathEscape(nodeID) + "/rename/" + url.PathEscape(name)
	res, err := c.do(ctx, http.MethodPost, path, nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Message: "Failed to rename node", Status: res.StatusCode, Body: string(b)}
	}
	return nil
}

func (c *Client) ExpireNode(ctx context.Context, nodeID string) error {
	return c.postExpire(ctx, nodeID, nil)
}

func (c *Client) ClearNodeExpiry(ctx context.Context, nodeID string) (bool, error) {
	disable := true
	if err := c.postExpire(ctx, nodeID, map[string]any{"disableExpiry": disable}); err != nil {
		far := time.Now().UTC().AddDate(100, 0, 0)
		if err := c.postExpire(ctx, nodeID, map[string]any{"expiry": far.Format(time.RFC3339)}); err != nil {
			return false, err
		}
	}
	expiry, err := c.nodeExpiry(ctx, nodeID)
	if err != nil {
		return false, err
	}
	return expiry.IsZero() || expiry.After(time.Now().Add(time.Hour)), nil
}

func (c *Client) postExpire(ctx context.Context, nodeID string, body any) error {
	res, err := c.do(ctx, http.MethodPost, "/api/v1/node/"+url.PathEscape(nodeID)+"/expire", body)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Message: "Failed to update node expiry", Status: res.StatusCode, Body: string(b)}
	}
	return nil
}

func (c *Client) nodeExpiry(ctx context.Context, nodeID string) (time.Time, error) {
	res, err := c.do(ctx, http.MethodGet, "/api/v1/node/"+url.PathEscape(nodeID), nil)
	if err != nil {
		return time.Time{}, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return time.Time{}, &Error{Message: "Failed to read node", Status: res.StatusCode, Body: string(raw)}
	}
	var payload struct {
		Node struct {
			Expiry string `json:"expiry"`
		} `json:"node"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return time.Time{}, err
	}
	if strings.TrimSpace(payload.Node.Expiry) == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, payload.Node.Expiry)
	if err != nil {
		return time.Time{}, nil
	}
	return parsed, nil
}

func (c *Client) DeleteNode(ctx context.Context, nodeID string) error {
	res, err := c.do(ctx, http.MethodDelete, "/api/v1/node/"+url.PathEscape(nodeID), nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Message: "Failed to delete node", Status: res.StatusCode, Body: string(b)}
	}
	return nil
}

func (c *Client) SetNodeTags(ctx context.Context, nodeID string, tags []string) error {
	res, err := c.do(ctx, http.MethodPost, "/api/v1/node/"+url.PathEscape(nodeID)+"/tags", map[string]any{"tags": tags})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Message: "Failed to set node tags", Status: res.StatusCode, Body: string(b)}
	}
	return nil
}

func CollectNodeTags(raw map[string]any) []string {
	pre := asMap(raw["preAuthKey"])
	if len(pre) == 0 {
		pre = asMap(raw["pre_auth_key"])
	}
	buckets := []any{raw["tags"], raw["validTags"], raw["valid_tags"], raw["forcedTags"], raw["forced_tags"], pre["aclTags"], pre["acl_tags"]}
	seen := map[string]struct{}{}
	var out []string
	for _, bucket := range buckets {
		for _, tag := range asStrings(bucket) {
			if _, ok := seen[tag]; ok {
				continue
			}
			seen[tag] = struct{}{}
			out = append(out, tag)
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

func mapNode(raw map[string]any) Node {
	host := asMap(raw["hostInfo"])
	if len(host) == 0 {
		host = asMap(raw["host_info"])
	}
	user := asMap(raw["user"])
	addresses := asStrings(raw["ipAddresses"])
	if len(addresses) == 0 {
		addresses = asStrings(raw["ip_addresses"])
	}
	if len(addresses) == 0 {
		addresses = asStrings(raw["addresses"])
	}
	last, _ := raw["lastSeen"].(string)
	if last == "" {
		last, _ = raw["last_seen"].(string)
	}
	name, _ := raw["givenName"].(string)
	if name == "" {
		name, _ = raw["given_name"].(string)
	}
	if name == "" {
		name, _ = raw["name"].(string)
	}
	hostname, _ := host["hostname"].(string)
	if hostname == "" {
		hostname, _ = raw["name"].(string)
	}
	online, _ := raw["online"].(bool)
	userName, _ := user["name"].(string)
	return Node{
		ID: fmt.Sprint(raw["id"]), Name: name, Hostname: hostname, Tags: CollectNodeTags(raw),
		Online: online, LastSeen: last, Addresses: addresses, UserName: userName,
	}
}

func NodeFingerprint(nodes []Node) string {
	parts := make([]string, 0, len(nodes))
	for _, node := range nodes {
		online := "0"
		if node.Online {
			online = "1"
		}
		parts = append(parts, strings.Join([]string{
			node.ID, node.Name, node.Hostname, online, strings.Join(node.Tags, ","), strings.Join(node.Addresses, ","),
		}, "|"))
	}
	for i := 1; i < len(parts); i++ {
		j := i
		for j > 0 && parts[j] < parts[j-1] {
			parts[j], parts[j-1] = parts[j-1], parts[j]
			j--
		}
	}
	return strings.Join(parts, "\n")
}

func asMap(value any) map[string]any {
	m, _ := value.(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}

func asStrings(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		s, ok := item.(string)
		if ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}
