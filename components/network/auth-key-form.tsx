"use client";

import { useState, useTransition } from "react";
import { createAuthKey } from "@/lib/actions/network";
import { Button } from "@/components/ui/button";

export function AuthKeyForm({
  environments,
}: {
  environments: { tag: string; name: string }[];
}) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4">
      <form
        className="flex flex-wrap items-end gap-3"
        action={(fd) => {
          startTransition(async () => {
            setError(null);
            setKey(null);
            try {
              const result = await createAuthKey(fd);
              setKey(result);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed");
            }
          });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Environment tag
          <select name="tag" className="rounded-[100px] border border-ash px-4 py-2">
            <option value="">None</option>
            {environments.map((e) => (
              <option key={e.tag} value={e.tag}>
                {e.name} ({e.tag})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="reusable" />
          Reusable
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          Generate key
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-off-black">{error}</p>}
      {key && (
        <p className="mt-3 break-all rounded-[40px] border border-ash bg-periwinkle-mist p-4 font-mono text-sm">
          {key}
        </p>
      )}
    </div>
  );
}
