import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { UserCapabilities } from "@/types/roles";
import { ConsoleNav, ConsoleWordmark } from "@/components/layout/console-nav";

export function ConsoleShell({
  ctx,
  footer,
  children,
}: {
  ctx: UserCapabilities;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const identity = ctx.name?.trim() || ctx.email;
  const close = () => setMobileOpen(false);

  const account = (
    <div className="border-t border-ash p-2">
      <div className="px-2 py-1.5">
        <p className="truncate text-[14px] font-medium text-off-black">{identity}</p>
        <p className="truncate text-[12px] text-smoke">{ctx.email}</p>
      </div>
      {footer}
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed top-0 left-0 z-20 hidden h-screen w-60 border-r border-ash bg-parchment lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center border-b border-ash px-2">
            <div className="min-w-0 flex-1">
              <ConsoleWordmark>
                <span className="sr-only">Organisation</span>
              </ConsoleWordmark>
            </div>
            {ctx.isOwner ? (
              <span className="mr-2 shrink-0 rounded-[9999px] border border-ash px-2 py-0.5 text-[11px] uppercase tracking-[-0.3px] text-off-black">
                Owner
              </span>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="mb-3 truncate px-3.5 text-[12px] text-smoke">{ctx.email}</p>
            <ConsoleNav capabilities={ctx.capabilities} />
          </div>
          {account}
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-10 flex h-14 items-center gap-1 border-b border-ash bg-parchment px-3 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation menu"
          className="rounded-[6px] p-2 text-off-black hover:bg-[color-mix(in_srgb,var(--color-ash)_40%,transparent)]"
          onClick={() => setMobileOpen(true)}
        >
          <span aria-hidden className="block h-0.5 w-5 bg-off-black" />
          <span aria-hidden className="mt-1 block h-0.5 w-5 bg-off-black" />
          <span aria-hidden className="mt-1 block h-0.5 w-5 bg-off-black" />
        </button>
        <ConsoleWordmark />
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-30 flex flex-col bg-parchment lg:hidden">
          <div className="flex h-14 items-center px-3">
            <button
              type="button"
              aria-label="Close navigation menu"
              className="rounded-[6px] p-2 text-off-black hover:bg-[color-mix(in_srgb,var(--color-ash)_40%,transparent)]"
              onClick={close}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <hr className="border-ash" />
          <div className="flex-1 overflow-y-auto p-2">
            <ConsoleNav capabilities={ctx.capabilities} onNavigate={close} />
          </div>
          {account}
        </div>
      ) : null}

      <div className="min-w-0 pt-14 lg:pt-0">
        <main className="mx-auto w-full max-w-[1432px] px-4 py-8 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
