import { useState, useTransition, type FormEvent } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { Field, Input } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="relative rounded-[8px] border border-ash bg-parchment">
      <div className="absolute top-2 right-2">
        <CopyButton text={command} label="Copy command" icon />
      </div>
      <pre className="overflow-x-auto p-4 pr-12 text-sm whitespace-pre-wrap">{command}</pre>
    </div>
  );
}

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
  const [issued, setIssued] = useState<{ key: string; loginServer: string; enrollment: string; apiUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const server = issued?.loginServer || loginServer;
  const otterscaleCommand = issued
    ? `otterscale up --login-server=${server} --auth-key=${issued.key} --api-url=${issued.apiUrl} --enrollment=${issued.enrollment}`
    : null;
  const tailscaleCommand = issued
    ? `tailscale logout\ntailscale up --login-server=${server} --auth-key=${issued.key}`
    : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      setIssued(null);
      try {
        const result = await api.createKey({
          workspaceIds: fd.getAll("workspaceIds").map(String),
          tagIds: fd.getAll("tagIds").map(String),
          expiry: String(fd.get("expiration") ?? ""),
        });
        setIssued({
          key: result.key,
          loginServer: result.loginServer,
          enrollment: result.enrollment,
          apiUrl: result.apiUrl,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create a key");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
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
        <div className="flex flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
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
        <Field label="Expiry" hint="Pick a preset or type 48h, 7d, or an ISO datetime.">
          <Input
            name="expiration"
            list="auth-key-expiry"
            defaultValue={defaultExpiry}
            autoComplete="off"
          />
          <datalist id="auth-key-expiry">
            {["1 hour", "24 hours", "7 days", "90 days"].map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
        </Field>
        <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal">
          <input type="checkbox" name="reusable" defaultChecked />
          Reusable
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Generating…" : "Add machine"}
        </Button>
      </form>
      {error ? <p className="text-sm text-off-black">{error}</p> : null}
      {otterscaleCommand && tailscaleCommand && issued ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-graphite">Registers this computer and lists machines in the Otterscale app.</p>
            <CommandBlock command={otterscaleCommand} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-graphite">Registers this machine on the website only.</p>
            <CommandBlock command={tailscaleCommand} />
          </div>
          <CopyButton text={issued.key} label="Copy key" />
        </div>
      ) : null}
    </div>
  );
}
