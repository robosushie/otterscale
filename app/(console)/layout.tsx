import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadUserCapabilities } from "@/lib/authz/load-context";
import { ConsoleShell } from "@/components/layout/console-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
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
      <ConsoleShell ctx={ctx} footer={<SignOutButton />}>
        {children}
      </ConsoleShell>
    </CapabilitiesProvider>
  );
}
