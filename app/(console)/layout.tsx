import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadUserCapabilities } from "@/lib/authz/load-context";
import { ConsoleHeader } from "@/components/layout/console-header";
import { CapabilitiesProvider } from "@/contexts/capabilities-context";

export const instant = false;

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx) redirect("/signin");

  return (
    <CapabilitiesProvider value={ctx}>
      <ConsoleHeader ctx={ctx} />
      <main className="mx-auto w-full max-w-[1432px] flex-1 px-6 py-16">{children}</main>
    </CapabilitiesProvider>
  );
}
