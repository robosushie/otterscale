"use client";

import { useState, useTransition, type FormEvent } from "react";
import { publishApp } from "@/lib/actions/apps";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function AppForm({
  machines,
  baseDomain,
  initial,
  submitLabel = "Add app",
  onSaved,
}: {
  machines: { id: string; name: string }[];
  baseDomain: string;
  initial?: { appId: string; machineId: string; port: number; subdomain: string };
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState(initial?.subdomain ?? "");
  const [pending, startTransition] = useTransition();
  const previewHost = subdomain.trim()
    ? `${subdomain.trim().toLowerCase()}.${baseDomain}`
    : `{subdomain}.${baseDomain}`;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await publishApp(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.error) {
        setError(result.data.error);
        return;
      }
      if (onSaved) {
        onSaved();
        return;
      }
      setNotice(`Published. Reach it at https://${String(fd.get("subdomain"))}.${baseDomain}`);
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      {initial ? <input type="hidden" name="appId" value={initial.appId} /> : null}
      <Field label="Machine">
        <Select name="machineId" required defaultValue={initial?.machineId ?? ""}>
          <option value="">Select machine</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Port">
        <Input
          name="port"
          type="number"
          min={1}
          max={65535}
          required
          placeholder="3000"
          defaultValue={initial?.port}
        />
      </Field>
      <Field label="Subdomain" hint={previewHost}>
        <Input
          name="subdomain"
          required
          placeholder="grafana"
          value={subdomain}
          onChange={(event) => setSubdomain(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Probing…" : submitLabel}
      </Button>
      {error ? <p className="text-sm text-off-black">{error}</p> : null}
      {notice ? <p className="text-sm text-graphite">{notice}</p> : null}
    </form>
  );
}
