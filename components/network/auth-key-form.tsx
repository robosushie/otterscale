"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createAuthKey } from "@/lib/actions/network";
import { AUTH_KEY_EXPIRY_PRESETS } from "@/lib/headscale/expiry";
import { tailscaleUpCommand } from "@/lib/headscale/login-server";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { Field, Input } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";

export function AuthKeyForm({
  workspaces,
  tags,
  loginServer,
  defaultExpiry,
}: {
  workspaces: { id: string; name: string }[];
  tags: { id: string; name: string; aclTag: string }[];
  loginServer: string;
  defaultExpiry: string;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const command = key ? tailscaleUpCommand(key, loginServer) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      setKey(null);
      const result = await createAuthKey(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKey(result.data);
    });
  }

  return (
    <div>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
            <span>Workspaces</span>
            <CheckMenu
              name="workspaceIds"
              placeholder="Select workspaces"
              options={workspaces.map((ws) => ({ id: ws.id, label: ws.name }))}
            />
            <span className="text-[12px] font-normal normal-case tracking-[-0.4px] text-smoke">
              Required. Devices join these ACL groups.
            </span>
          </div>
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
            <span>Tags</span>
            <CheckMenu
              name="tagIds"
              placeholder="Select tags"
              options={tags.map((tag) => ({ id: tag.id, label: `${tag.name} (${tag.aclTag})` }))}
            />
            <span className="text-[12px] font-normal normal-case tracking-[-0.4px] text-smoke">
              Optional labels such as prod, uat, or custom.
            </span>
          </div>
          <Field
            label="Expiry"
            className="min-w-[12rem]"
            hint="Pick a preset or type 48h, 7d, or an ISO datetime."
          >
            <Input
              name="expiration"
              list="auth-key-expiry"
              defaultValue={defaultExpiry}
              autoComplete="off"
              className="min-w-[12rem]"
            />
            <datalist id="auth-key-expiry">
              {AUTH_KEY_EXPIRY_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
          </Field>
          <div className="flex flex-wrap items-center gap-3 pt-[22px]">
            <label className="flex items-center gap-2 text-sm normal-case">
              <input type="checkbox" name="reusable" />
              Reusable
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Add device"}
            </Button>
          </div>
        </div>
      </form>
      {error && <p className="mt-3 text-sm text-off-black">{error}</p>}
      {command && key && (
        <div className="mt-4 rounded-[8px] border border-ash bg-paper p-4">
          <p className="text-[12px] uppercase tracking-[-0.4px] text-smoke">Register with Tailscale</p>
          <pre className="mt-2 overflow-x-auto text-sm whitespace-pre-wrap">{command}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={command} label="Copy command" />
            <CopyButton text={key} label="Copy key" />
          </div>
        </div>
      )}
    </div>
  );
}
