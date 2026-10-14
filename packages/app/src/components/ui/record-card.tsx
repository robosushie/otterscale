import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function RecordCard({
  title,
  rows,
  actions,
  children,
}: {
  title: ReactNode;
  rows: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <div className="text-sm font-medium">{title}</div>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-smoke">{row.label}</dt>
            <dd className="min-w-0 text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
      {children}
      {actions ? <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div> : null}
    </Card>
  );
}

export function RecordCards({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 lg:hidden">{children}</div>;
}
