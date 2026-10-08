import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[40px] border border-ash bg-paper p-8 ${className}`}>
      {children}
    </div>
  );
}
