type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  actorEmail: string | null;
  eventHash: string;
};

export function AuditTable({ events, empty }: { events: AuditRow[]; empty: string }) {
  return (
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
              <div className="cell whitespace-nowrap">{e.createdAt.toISOString()}</div>
            </td>
            <td>
              <div className="cell">{e.action}</div>
            </td>
            <td>
              <div className="cell">{e.actorEmail ?? "—"}</div>
            </td>
            <td>
              <div className="cell font-mono text-xs">{e.eventHash.slice(0, 12)}…</div>
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
  );
}
