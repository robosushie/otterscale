type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  actorEmail: string | null;
  eventHash: string;
};

export function AuditTable({ events, empty }: { events: AuditRow[]; empty: string }) {
  return (
    <table className="w-full text-left text-sm tabular-nums">
      <thead>
        <tr className="border-b border-ash">
          <th className="py-2 pr-4">Time</th>
          <th className="pr-4">Action</th>
          <th className="pr-4">Actor</th>
          <th>Hash</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-b border-ash">
            <td className="py-2 pr-4 whitespace-nowrap">{e.createdAt.toISOString()}</td>
            <td className="pr-4">{e.action}</td>
            <td className="pr-4">{e.actorEmail ?? "—"}</td>
            <td className="font-mono text-xs">{e.eventHash.slice(0, 12)}…</td>
          </tr>
        ))}
        {events.length === 0 && (
          <tr>
            <td colSpan={4} className="py-4 text-smoke">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
