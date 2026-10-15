package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"otterscale/core/internal/headscale"
	"otterscale/core/internal/id"
)

func (a *API) enrollDevice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enrollment string   `json:"enrollment"`
		Addresses  []string `json:"addresses"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid body")
		return
	}
	if err := a.linkBook().enrollmentReady(strings.TrimSpace(body.Enrollment), time.Now()); err != nil {
		fail(w, http.StatusGone, err.Error())
		return
	}
	client := headscale.FromEnv()
	if client == nil {
		fail(w, http.StatusServiceUnavailable, "Headscale is not configured")
		return
	}
	nodes, err := client.ListNodes(r.Context())
	if err != nil {
		fail(w, http.StatusBadGateway, headscale.FormatError(err))
		return
	}
	node, err := matchNode(nodes, body.Addresses)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{"error": err.Error(), "retry": err == errNodePending})
		return
	}
	org, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := a.Store.SyncMachines(r.Context(), org.ID, []headscale.Node{node}); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var machineID string
	var disabled bool
	if err := a.Store.DB.QueryRow(r.Context(), `SELECT "id","disabled" FROM "Machine" WHERE "headscaleNodeId"=?`, node.ID).Scan(&machineID, &disabled); err != nil {
		failRetry(w, "this computer has not registered yet")
		return
	}
	if disabled {
		fail(w, http.StatusForbidden, "this computer is disabled")
		return
	}
	if err := a.linkBook().consumeEnrollment(strings.TrimSpace(body.Enrollment), time.Now()); err != nil {
		fail(w, http.StatusGone, err.Error())
		return
	}
	token, err := newDeviceToken()
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `DELETE FROM "DeviceCredential" WHERE "machineId"=?`, machineID); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := a.Store.DB.Exec(r.Context(), `INSERT INTO "DeviceCredential" ("id","machineId","tokenHash","createdAt") VALUES (?,?,?,?)`,
		id.New(), machineID, secretHash(token), time.Now().UTC()); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}

func (a *API) checkDevice(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		fail(w, http.StatusUnauthorized, "missing device token")
		return
	}
	var disabled bool
	err := a.Store.DB.QueryRow(r.Context(), `SELECT m."disabled" FROM "DeviceCredential" d JOIN "Machine" m ON m."id"=d."machineId" WHERE d."tokenHash"=?`, secretHash(token)).Scan(&disabled)
	if err != nil {
		fail(w, http.StatusUnauthorized, "this computer was removed")
		return
	}
	if disabled {
		fail(w, http.StatusForbidden, "this computer is disabled")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func bearerToken(r *http.Request) string {
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if len(header) < len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

func newDeviceToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func matchNode(nodes []headscale.Node, addresses []string) (headscale.Node, error) {
	want := map[string]struct{}{}
	for _, addr := range addresses {
		addr = strings.TrimSpace(addr)
		if addr != "" {
			want[addr] = struct{}{}
		}
	}
	if len(want) == 0 {
		return headscale.Node{}, errNodePending
	}
	var hit *headscale.Node
	for i := range nodes {
		for _, addr := range nodes[i].Addresses {
			if _, ok := want[addr]; !ok {
				continue
			}
			if hit != nil && hit.ID != nodes[i].ID {
				return headscale.Node{}, errNodeAmbiguous
			}
			hit = &nodes[i]
		}
	}
	if hit == nil {
		return headscale.Node{}, errNodePending
	}
	return *hit, nil
}

func failRetry(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusConflict, map[string]any{"error": msg, "retry": true})
}

type nodeMatchError string

func (e nodeMatchError) Error() string { return string(e) }

const (
	errNodePending   nodeMatchError = "this computer has not registered yet"
	errNodeAmbiguous nodeMatchError = "could not match one computer"
)
