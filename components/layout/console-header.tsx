import Link from "next/link";
import { signOut } from "@/lib/auth";
import { ConsoleNav } from "@/components/layout/console-nav";
import type { UserCapabilities } from "@/types/roles";
import { Button } from "@/components/ui/button";

export function ConsoleHeader({ ctx }: { ctx: UserCapabilities }) {
  return (
    <header className="sticky top-0 z-50 bg-parchment">
      <div className="mx-auto flex h-20 max-w-[1432px] items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-10">
          <Link href="/workspace" className="font-display text-[24px] tracking-[-0.48px] text-off-black">
            Otterscale
          </Link>
          <ConsoleNav capabilities={ctx.capabilities} />
        </div>
        <div className="flex items-center gap-4 text-[12px] uppercase tracking-[-0.4px] text-smoke">
          <span>{ctx.email}</span>
          {ctx.isOwner && (
            <span className="rounded-[9999px] border border-ash px-3 py-1 text-off-black">Owner</span>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
