import { liveSession, redirectSignedOut } from "@/lib/auth/live-session";
import { hasOwner } from "@/lib/auth/owner";
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
  const session = await liveSession();
  if (!session?.user?.id) redirectSignedOut(await hasOwner());

  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx) redirectSignedOut(await hasOwner());

  return (
    <CapabilitiesProvider value={ctx}>
      <ConsoleShell ctx={ctx} footer={<SignOutButton />}>
        {children}
      </ConsoleShell>
    </CapabilitiesProvider>
  );
}
