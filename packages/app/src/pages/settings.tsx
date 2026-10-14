import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import { api } from "@/api/client";
import { ExpireKeyButton } from "@/components/network/expire-key-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCard, RecordCards } from "@/components/ui/record-card";
import { useCapabilities } from "@/hooks/use-capabilities";
import { UsersPage } from "@/pages/users";

export function SettingsGeneralPage() {
  const ctx = useCapabilities();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("apps.localhost");
  useEffect(() => {
    void api.settings().then((org) => {
      setName(org.name);
      setDomain(org.appsBaseDomain);
    }).catch(() => undefined);
  }, []);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void api.updateSettings({ name, appsBaseDomain: domain });
  }
  return (
    <div>
      <PageHeader title="General" description="Organisation name, owner, and super admins." />
      <Card className="mb-6">
        <h2 className="text-[24px]">Organisation</h2>
        {ctx.capabilities.includes("platform.settings") ? (
          <form onSubmit={onSubmit} className="mt-4 flex max-w-md flex-col gap-3">
            <label className="text-sm">
              Display name
              <input name="name" value={name} onChange={(event) => setName(event.target.value)} className={controlClassName} required />
            </label>
            <label className="text-sm">
              Apps base domain
              <input name="appsBaseDomain" value={domain} onChange={(event) => setDomain(event.target.value)} className={controlClassName} />
            </label>
            <Button type="submit" variant="secondary" icon aria-label="Save organisation" className="self-start">
              <Save className="size-3.5" />
            </Button>
          </form>
        ) : <p className="mt-3">{name}</p>}
      </Card>
    </div>
  );
}

export function SettingsDevicesPage() {
  const [hours, setHours] = useState(24);
  useEffect(() => {
    void api.settings().then((org) => setHours(org.defaultAuthKeyExpiryHours)).catch(() => undefined);
  }, []);
  return (
    <div>
      <PageHeader title="Device management" description="Default auth-key expiry for new devices." />
      <Card>
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void api.updateSettings({ defaultAuthKeyExpiryHours: hours });
          }}
        >
          <label className="text-sm">
            Default auth key expiry (hours)
            <input name="defaultAuthKeyExpiryHours" type="number" min={1} value={hours} onChange={(event) => setHours(Number(event.target.value))} className={controlClassName} />
          </label>
          <label className="flex items-center gap-2 text-sm text-smoke">
            <input type="checkbox" disabled />
            Require device approval (not in Phase 1–2)
          </label>
          <Button type="submit" variant="secondary" icon aria-label="Save device settings" className="self-start">
            <Save className="size-3.5" />
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function SettingsPolicyPage() {
  const [latest, setLatest] = useState<{ status: string; contentHash: string; hujson: string } | null>(null);
  useEffect(() => {
    void api.policies().then((rows) => setLatest(rows[0] ?? null)).catch(() => undefined);
  }, []);
  return (
    <div>
      <PageHeader
        title="Policy file"
        description="Compiled Headscale HuJSON for this tailnet."
        action={<Link to="/policies"><Button variant="secondary">Open Policies</Button></Link>}
      />
      <Card>
        <p className="text-sm text-graphite">Latest snapshot: {latest ? `${latest.status} · ${latest.contentHash.slice(0, 12)}…` : "none"}</p>
        {latest ? <pre className="mt-4 max-h-[28rem] overflow-auto text-xs whitespace-pre-wrap">{latest.hujson}</pre> : <p className="mt-4 text-smoke">Preview and apply policy from Access controls → Policies.</p>}
      </Card>
    </div>
  );
}

export function SettingsKeysPage() {
  const [keys, setKeys] = useState<{ id: string; key: string; reusable: boolean; aclTags: string[]; expiration: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api.keys().then(setKeys).catch((err: Error) => setError(err.message));
  }, []);
  return (
    <div>
      <PageHeader title="Keys" description="Pre-auth keys issued for device join." />
      {error ? <Card><p className="text-graphite">{error}</p></Card> : (
        <>
        <RecordCards>
          {(keys ?? []).map((key) => (
            <RecordCard
              key={key.id || key.key}
              title={key.key ? `${key.key.slice(0, 12)}…` : key.id}
              rows={[
                { label: "Reusable", value: key.reusable ? "Yes" : "No" },
                { label: "Tags", value: key.aclTags?.join(", ") || "—" },
                { label: "Expires", value: key.expiration ? new Date(key.expiration).toLocaleString() : "—" },
              ]}
              actions={<ExpireKeyButton authKey={key.key} />}
            />
          ))}
        </RecordCards>
        {keys && keys.length === 0 ? <p className="text-sm text-smoke lg:hidden">No auth keys yet.</p> : null}
        <div className="hidden lg:block">
        <table className="console-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ash">
              <th>Key</th>
              <th>Reusable</th>
              <th>Tags</th>
              <th>Expires</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {(keys ?? []).map((key) => (
              <tr key={key.id || key.key} className="border-b border-ash">
                <td><div className="cell font-mono text-xs">{key.key ? `${key.key.slice(0, 12)}…` : key.id}</div></td>
                <td><div className="cell">{key.reusable ? "Yes" : "No"}</div></td>
                <td><div className="cell">{key.aclTags?.join(", ") || "—"}</div></td>
                <td><div className="cell tabular-nums">{key.expiration ? new Date(key.expiration).toLocaleString() : "—"}</div></td>
                <td className="actions"><div className="cell-end"><ExpireKeyButton authKey={key.key} /></div></td>
              </tr>
            ))}
            {keys && keys.length === 0 ? (
              <tr><td colSpan={5}><div className="cell text-smoke">No auth keys yet.</div></td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
        </>
      )}
    </div>
  );
}

export function SettingsUsersPage() {
  return <UsersPage title="Users" description="Invite people and assign workspaces." requireInvite />;
}
