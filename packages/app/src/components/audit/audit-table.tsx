import { RecordCard, RecordCards } from "@/components/ui/record-card";

type AuditRow = {
  id: string;
  createdAt: Date | string;
  action: string;
  actorEmail: string | null;
  eventHash?: string;
};

export function AuditTable({ events, empty }: { events: AuditRow[]; empty: string }) {
  return (
    <>
      <RecordCards>
        {events.map((e) => {
          const when = e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt;
          return (
            <RecordCard
              key={e.id}
              title={e.action}
              rows={[
                { label: "Time", value: when },
                { label: "Actor", value: e.actorEmail ?? "—" },
                { label: "Hash", value: e.eventHash ? `${e.eventHash.slice(0, 12)}…` : "—" },
              ]}
            />
          );
        })}
      </RecordCards>
      {events.length === 0 ? <p className="text-sm text-smoke lg:hidden">{empty}</p> : null}
      <div className="hidden lg:block">
    <table className="console-table w-full text-left text-sm tabular-nums">
      <thead>
        <tr className="border-b border-ash">
          <th>Time</th>
          <th>Action</th>
          <th>Actor</th>
          <th>Hash</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-b border-ash">
            <td>
              <div className="cell whitespace-nowrap">{e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt}</div>
            </td>
            <td>
              <div className="cell">{e.action}</div>
            </td>
            <td>
              <div className="cell">{e.actorEmail ?? "—"}</div>
            </td>
            <td>
              <div className="cell font-mono text-xs">{e.eventHash ? `${e.eventHash.slice(0, 12)}…` : "—"}</div>
            </td>
          </tr>
        ))}
        {events.length === 0 && (
          <tr>
            <td colSpan={4}>
              <div className="cell text-smoke">{empty}</div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
      </div>
    </>
  );
}
