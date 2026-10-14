import { useEffect, useState } from "react";
import { api, type MachinesTable } from "@/api/client";
import { MachinesTable as MachinesGrid } from "@/components/network/machine-editor";
import { useCapabilities } from "@/hooks/use-capabilities";

export function MachinesLive({ initial }: { initial: MachinesTable }) {
  const ctx = useCapabilities();
  const [data, setData] = useState(initial);

  useEffect(() => {
    const source = new EventSource("/api/live");
    const onEvent = (event: Event) => {
      try {
        setData(JSON.parse((event as MessageEvent).data) as MachinesTable);
      } catch {
        /* ignore malformed frames */
      }
    };
    source.addEventListener("machines", onEvent);
    return () => {
      source.removeEventListener("machines", onEvent);
      source.close();
    };
  }, []);

  const reload = () => {
    void api.machines().then(setData).catch(() => undefined);
  };

  return (
    <>
      {data.headscaleError ? <p className="mb-4 text-sm text-off-black">{data.headscaleError}</p> : null}
      <p className="mb-3 text-[12px] text-smoke">
        {data.rows.length} {data.rows.length === 1 ? "machine" : "machines"}
      </p>
      <MachinesGrid
        rows={data.rows}
        currentUserId={ctx.userId}
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
