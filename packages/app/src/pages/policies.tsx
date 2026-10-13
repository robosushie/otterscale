import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { AddRulePanel } from "@/components/workspace/add-rule-panel";
import { PolicyControls } from "@/components/workspace/policy-controls";

export function PoliciesPage() {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [rules, setRules] = useState<{ id: string; group: string; tag: string; ports: string }[]>([]);
  const [latest, setLatest] = useState<{ id: string; hujson: string } | null>(null);
  const load = () => {
    void api.workspaces().then((rows) => setGroups(rows.map((row) => ({ id: row.id, name: row.name })))).catch(() => undefined);
    void api.tags().then((rows) => setTags(rows.map((row) => ({ id: row.id, name: row.name })))).catch(() => undefined);
    void api.rules().then(setRules).catch(() => setRules([]));
    void api.policies().then((rows) => setLatest(rows[0] ? { id: rows[0].id, hujson: rows[0].hujson } : null)).catch(() => undefined);
  };
  useEffect(load, []);
  return (
    <div>
      <PageHeader title="Policies" description="Extra rules on top of workspace isolation." action={<AddRulePanel groups={groups} tags={tags} />} />
      <p className="mb-3 text-[12px] text-smoke">{rules.length} {rules.length === 1 ? "rule" : "rules"}</p>
      <table className="console-table mb-10 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Workspace</th>
            <th>Tag</th>
            <th>Ports</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-b border-ash">
              <td><div className="cell">{rule.group}</div></td>
              <td><div className="cell">{rule.tag || "—"}</div></td>
              <td><div className="cell">{rule.ports}</div></td>
            </tr>
          ))}
          {rules.length === 0 ? (
            <tr>
              <td colSpan={3}><div className="cell text-smoke">No extra rules.</div></td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <PolicyControls
        latestSnapshotId={latest?.id ?? null}
        previewAction={async () => ({
          ok: true,
          errors: [],
          lint: [],
          snapshot: latest ?? undefined,
          compiled: latest ? { hujson: latest.hujson } : undefined,
        })}
        applyAction={async () => {
          const applied = await api.applyPolicy();
          setLatest((current) => (current ? { ...current, hujson: applied.hujson } : current));
          load();
        }}
        rollbackAction={async () => {
          throw new Error("Rollback uses the previous applied snapshot from Policies.");
        }}
      />
    </div>
  );
}
