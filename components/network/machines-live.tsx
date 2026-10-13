"use client";

import { useCallback, useEffect, useState } from "react";
import { refreshMachinesTable } from "@/lib/actions/network";
import type { MachinesTableData } from "@/lib/machines/list";
import { MachinesTable } from "@/components/network/machine-editor";

const INTERVAL_MS = 5000;

/** Poll Headscale into this table only. The rest of the page stays mounted. */
export function MachinesLive({ initial }: { initial: MachinesTableData }) {
  const [data, setData] = useState(initial);
  const reload = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void refreshMachinesTable()
      .then((next) => setData(next))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!initial.configured) return;
    const id = window.setInterval(reload, INTERVAL_MS);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [initial.configured, reload]);

  return (
    <>
      {data.headscaleError ? <p className="mb-4 text-sm text-off-black">{data.headscaleError}</p> : null}
      <p className="mb-3 text-[12px] text-smoke">
        {data.rows.length} {data.rows.length === 1 ? "machine" : "machines"}
      </p>
      <MachinesTable
        rows={data.rows}
        canManage={data.canManage}
        workspaces={data.workspaces}
        tags={data.tags}
        onMutated={reload}
      />
      {data.unassigned > 0 && data.canManage ? (
        <p className="mt-4 text-sm text-smoke">
          {data.unassigned} stored machine{data.unassigned === 1 ? "" : "s"} with no live Headscale node.
          Assign workspaces after they rejoin.
        </p>
      ) : null}
    </>
  );
}
