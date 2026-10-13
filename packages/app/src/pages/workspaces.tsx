import { useCallback, useEffect, useState } from "react";
import { api, type WorkspaceRow } from "@/api/client";
import { WorkspacesBoard } from "@/components/workspace/workspaces-board";
import { useLive } from "@/hooks/use-live";

export function WorkspacesPage() {
  const [rows, setRows] = useState<WorkspaceRow[] | null>(null);
  const load = useCallback(() => {
    void api.workspaces().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const apply = useCallback((next: WorkspaceRow[]) => setRows(next), []);
  useLive("workspaces", apply);
  if (!rows) return <p className="text-sm text-smoke">Loading…</p>;
  return <WorkspacesBoard workspaces={rows} onChanged={load} />;
}
