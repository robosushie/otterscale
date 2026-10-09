"use client";

import { useState, useTransition, type FormEvent } from "react";
import { publishApp } from "@/lib/actions/apps";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function AppForm({
  machines,
  baseDomain,
}: {
  machines: { id: string; name: string }[];
  baseDomain: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      setNotice(`Published. Reach it at https://${String(fd.get("subdomain"))}.${baseDomain}`);
    });
  }

  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Machine" className="min-w-[12rem]">
          <Select name="machineId" required>
            <option value="">Select machine</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Port" className="w-28">
          <Input name="port" type="number" min={1} max={65535} required placeholder="3000" />
        </Field>
        <Field label="Subdomain" className="min-w-[12rem]">
          <Input name="subdomain" required placeholder="grafana" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Probing…" : "Publish"}
        </Button>
      </div>
      <p className="text-sm font-normal normal-case tracking-normal text-smoke">
        {`URL will be {subdomain}.${baseDomain}`}
      </p>
      {error ? <p className="text-sm text-off-black">{error}</p> : null}
      {notice ? <p className="text-sm text-graphite">{notice}</p> : null}
    </form>
  );
}
