package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

func (a *API) audit(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "audit.view"); !ok {
		return
	}
	category := r.URL.Query().Get("category")
	if category != "NETWORK" {
		category = "SYSTEM"
	}
	rows, err := a.Store.AuditRows(r.Context(), category)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *API) auditExport(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.require(w, r, "audit.export"); !ok {
		return
	}
	org, err := a.Store.DefaultOrg(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows, err := a.Store.DB.Query(r.Context(), `SELECT "id","actorId","action","category","resourceType","resourceId","beforeJson","afterJson","previousHash","eventHash","createdAt" FROM "AuditEvent" WHERE "organizationId"=? ORDER BY "createdAt" ASC`, org.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Content-Disposition", `attachment; filename="audit.jsonl"`)
	enc := json.NewEncoder(w)
	for rows.Next() {
		var id, action, category, previous, hash, created string
		var actor, resourceType, resourceID, before, after sql.NullString
		if err := rows.Scan(&id, &actor, &action, &category, &resourceType, &resourceID, &before, &after, &previous, &hash, &created); err != nil {
			return
		}
		_ = enc.Encode(map[string]any{
			"id": id, "actorId": actor.String, "action": action, "category": category,
			"resourceType": resourceType.String, "resourceId": resourceID.String,
			"beforeJson": before.String, "afterJson": after.String,
			"previousHash": previous, "eventHash": hash, "createdAt": created,
		})
	}
}
