import Link from "next/link";
import type { Capability } from "@/types/roles";

const links: { href: string; label: string; capability: Capability }[] = [
  { href: "/workspace", label: "Workspace", capability: "workspace.manage" },
  { href: "/network", label: "Network", capability: "network.view" },
  { href: "/audit", label: "Audit", capability: "audit.view" },
  { href: "/platform", label: "Platform", capability: "platform.view" },
];

export function ConsoleNav({ capabilities }: { capabilities: Capability[] }) {
  const visible = links.filter((l) => capabilities.includes(l.capability));
  return (
    <nav className="flex flex-wrap items-center gap-8 text-[18px] uppercase tracking-[-0.4px]">
      {visible.map((l) => (
        <Link key={l.href} href={l.href} className="text-off-black underline-offset-4 hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
