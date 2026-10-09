"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Capability } from "@/types/roles";

type NavChild = { href: string; label: string; capability: Capability };
type NavGroup = { id: string; label: string; children: NavChild[] };
type NavItem =
  | { type: "link"; href: string; label: string; capability: Capability }
  | { type: "group"; group: NavGroup };

const NAV: NavItem[] = [
  {
    type: "group",
    group: {
      id: "network",
      label: "Network",
      children: [
        { href: "/machines", label: "Machines", capability: "network.view" },
        { href: "/apps", label: "Apps", capability: "network.view" },
      ],
    },
  },
  { type: "link", href: "/users", label: "Users", capability: "members.view" },
  {
    type: "group",
    group: {
      id: "access",
      label: "Access controls",
      children: [
        { href: "/workspaces", label: "Workspaces", capability: "workspace.manage" },
        { href: "/tags", label: "Tags", capability: "workspace.manage" },
        { href: "/policies", label: "Policies", capability: "workspace.policy" },
      ],
    },
  },
  {
    type: "group",
    group: {
      id: "audit",
      label: "Audit",
      children: [
        { href: "/audit/system", label: "System logs", capability: "audit.view" },
        { href: "/audit/network", label: "Network logs", capability: "audit.view" },
      ],
    },
  },
  {
    type: "group",
    group: {
      id: "settings",
      label: "Settings",
      children: [
        { href: "/settings/general", label: "General", capability: "platform.view" },
        { href: "/settings/users", label: "User management", capability: "members.invite" },
        { href: "/settings/devices", label: "Device management", capability: "network.manage" },
        { href: "/settings/policy", label: "Policy file", capability: "workspace.policy" },
        { href: "/settings/keys", label: "Keys", capability: "network.manage" },
      ],
    },
  },
];

function linkClass(active: boolean, nested: boolean) {
  return [
    "relative flex items-center rounded-[6px] px-3.5 py-1.5 text-[14px] text-off-black",
    nested ? "pl-9" : "",
    active ? "bg-[color-mix(in_srgb,var(--color-ash)_55%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--color-ash)_40%,transparent)]",
  ]
    .filter(Boolean)
    .join(" ");
}

function visibleChildren(group: NavGroup, capabilities: Capability[]) {
  return group.children.filter((c) => capabilities.includes(c.capability));
}

function GroupSection({
  group,
  capabilities,
  pathname,
  defaultOpen,
}: {
  group: NavGroup;
  capabilities: Capability[];
  pathname: string;
  defaultOpen: boolean;
}) {
  const children = visibleChildren(group, capabilities);
  const [open, setOpen] = useState(defaultOpen);
  if (children.length === 0) return null;
  const childActive = children.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-[6px] px-3.5 py-1.5 text-left text-[14px] text-off-black hover:bg-[color-mix(in_srgb,var(--color-ash)_40%,transparent)] ${childActive ? "font-medium" : ""}`}
      >
        <span className="flex-1">{group.label}</span>
        <ChevronRight
          className={`size-3.5 shrink-0 text-smoke transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="flex flex-col">
          {children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={linkClass(pathname === c.href || pathname.startsWith(`${c.href}/`), true)}
              aria-current={pathname === c.href ? "page" : undefined}
            >
              {c.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ConsoleNav({ capabilities }: { capabilities: Capability[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {NAV.map((item) => {
        if (item.type === "link") {
          if (!capabilities.includes(item.capability)) return null;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(active, false)}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        }
        const children = visibleChildren(item.group, capabilities);
        const childActive = children.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
        return (
          <GroupSection
            key={item.group.id}
            group={item.group}
            capabilities={capabilities}
            pathname={pathname}
            defaultOpen={item.group.id === "network" || childActive}
          />
        );
      })}
    </nav>
  );
}

export function ConsoleWordmark({ children }: { children: ReactNode }) {
  return (
    <Link href="/machines" className="flex min-w-0 items-center gap-2 px-2 py-1.5">
      <span className="font-display text-[20px] tracking-[-0.4px] text-off-black">Otterscale</span>
      <span className="truncate text-[13px] text-graphite">{children}</span>
    </Link>
  );
}
