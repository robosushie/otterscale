import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type MachinesTable } from "@/api/client";
import { BrandMark } from "@/components/brand/lockup";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckMenu } from "@/components/ui/check-menu";
import { Field } from "@/components/ui/field";

export function LinkDevicePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code") ?? "";
  const [table, setTable] = useState<MachinesTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!code) return;
    void api.machines().then(setTable).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load workspaces");
    });
  }, [code]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      try {
        await api.approveLink(code, {
          workspaceIds: fd.getAll("workspaceIds").map(String),
          tagIds: fd.getAll("tagIds").map(String),
        });
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not approve this computer");
      }
    });
  }

  let body = <p className="text-sm text-smoke">Loading…</p>;
  if (!code) {
    body = <p className="text-sm text-graphite">This page needs a code from the Otterscale app.</p>;
  } else if (done) {
    body = (
      <div className="flex flex-col gap-4">
        <h1>Computer linked</h1>
        <p className="text-graphite">Return to the Otterscale app. It will join the network on its own.</p>
        <div>
          <Button type="button" onClick={() => navigate("/dashboard")}>Go to dashboard</Button>
        </div>
      </div>
    );
  } else if (!table) {
    body = <p className="text-sm text-smoke">{error ?? "Loading…"}</p>;
  } else if (!table.canManage) {
    body = (
      <div className="flex flex-col gap-4">
        <h1>Link this computer</h1>
        <p className="text-graphite">You need permission to add machines.</p>
      </div>
    );
  } else {
    body = (
      <form onSubmit={onSubmit} className="flex flex-col gap-4 text-left">
        <h1>Link this computer</h1>
        <p className="text-graphite">Choose a workspace. The app receives a one-time key and joins the network.</p>
        <Field label="Workspaces">
          <CheckMenu name="workspaceIds" placeholder="Choose workspaces" options={table.workspaces.map((item) => ({ id: item.id, label: item.name }))} />
        </Field>
        <Field label="Tags">
          <CheckMenu name="tagIds" placeholder="Optional tags" options={table.tags.map((item) => ({ id: item.id, label: item.name }))} />
        </Field>
        {error ? <p className="text-sm text-off-black">{error}</p> : null}
        <div>
          <Button type="submit" disabled={pending}>{pending ? "Linking…" : "Link computer"}</Button>
        </div>
      </form>
    );
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex justify-center">
          <BrandMark size={40} />
        </div>
        {body}
      </Card>
    </main>
  );
}
