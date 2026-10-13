import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, type Capabilities } from "@/api/client";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ConsoleShell } from "@/components/layout/console-shell";
import { CapabilitiesProvider } from "@/contexts/capabilities-context";
import type { UserCapabilities } from "@/types/roles";
import { AppsPage } from "@/pages/apps";
import { AuditPage } from "@/pages/audit";
import { MachinesPage } from "@/pages/machines";
import { PoliciesPage } from "@/pages/policies";
import { SettingsDevicesPage, SettingsGeneralPage, SettingsKeysPage, SettingsPolicyPage, SettingsUsersPage } from "@/pages/settings";
import { SetupPage } from "@/pages/setup";
import { SignInPage } from "@/pages/signin";
import { TagsPage } from "@/pages/tags";
import { UsersPage } from "@/pages/users";
import { WorkspacesPage } from "@/pages/workspaces";

function useSession() {
  const [user, setUser] = useState<Capabilities | null | undefined>(undefined);
  const [hasOwner, setHasOwner] = useState(true);
  const [oidc, setOidc] = useState(false);
  const [google, setGoogle] = useState(false);
  const reload = () => {
    api.session().then((session) => {
      setUser(session.user);
      setHasOwner(session.methods.hasOwner);
      setOidc(session.methods.oidc);
      setGoogle(Boolean(session.methods.google));
    }).catch(() => {
      setUser(null);
      setHasOwner(false);
    });
  };
  useEffect(reload, []);
  return { user, hasOwner, oidc, google, reload };
}

export function App() {
  const session = useSession();
  if (session.user === undefined) return <p className="p-8 text-sm text-smoke">Loading…</p>;
  return (
    <Routes>
      <Route path="/" element={session.user ? <Navigate to="/machines" /> : <Navigate to={session.hasOwner ? "/signin" : "/setup"} />} />
      <Route path="/setup" element={session.hasOwner ? <Navigate to="/signin" /> : <SetupPage oidc={session.oidc} google={session.google} />} />
      <Route path="/signin" element={session.user ? <Navigate to="/machines" /> : session.hasOwner ? <SignInPage oidc={session.oidc} google={session.google} /> : <Navigate to="/setup" />} />
      <Route path="/accept-invite" element={<Navigate to="/signin?signup=1" />} />
      <Route path="*" element={session.user ? <Console user={session.user} /> : <Navigate to={session.hasOwner ? "/signin" : "/setup"} />} />
    </Routes>
  );
}

function Console({ user }: { user: Capabilities }) {
  const location = useLocation();
  const ctx = user as UserCapabilities;
  return (
    <CapabilitiesProvider value={ctx}>
      <ConsoleShell ctx={ctx} footer={<SignOutButton />}>
        <Routes location={location}>
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/audit" element={<Navigate to="/audit/system" />} />
          <Route path="/audit/system" element={<AuditPage category="SYSTEM" title="System logs" description="Control-plane events with hash-chain integrity." />} />
          <Route path="/audit/network" element={<AuditPage category="NETWORK" title="Network logs" description="Mesh and device events." />} />
          <Route path="/settings" element={<Navigate to="/settings/general" />} />
          <Route path="/settings/general" element={<SettingsGeneralPage />} />
          <Route path="/settings/users" element={<SettingsUsersPage />} />
          <Route path="/settings/devices" element={<SettingsDevicesPage />} />
          <Route path="/settings/policy" element={<SettingsPolicyPage />} />
          <Route path="/settings/keys" element={<SettingsKeysPage />} />
          <Route path="*" element={<Navigate to="/machines" />} />
        </Routes>
      </ConsoleShell>
    </CapabilitiesProvider>
  );
}
