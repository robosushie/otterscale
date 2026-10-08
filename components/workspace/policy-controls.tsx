"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PreviewResult = Awaited<
  ReturnType<
    typeof import("@/lib/actions/workspace").previewPolicyAction
  >
>;

export function PolicyControls({
  latestSnapshotId,
  previewAction,
  applyAction,
  rollbackAction,
}: {
  latestSnapshotId: string | null;
  previewAction: () => Promise<PreviewResult>;
  applyAction: (id: string) => Promise<void>;
  rollbackAction: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <h2>Policy</h2>
      <p className="mt-2 text-sm text-graphite">
        Preview compiles intent to HuJSON. Apply pushes to Headscale when configured.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setError(null);
              try {
                const result = await previewAction();
                setPreview(result);
                if (!result.ok) setError(result.errors.map((e) => e.message).join("; "));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Preview failed");
              }
            });
          }}
        >
          Preview compile
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !preview?.ok || !preview.snapshot?.id}
          onClick={() => {
            const id = preview?.ok ? preview.snapshot.id : latestSnapshotId;
            if (!id) return;
            startTransition(async () => {
              try {
                await applyAction(id);
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Apply failed");
              }
            });
          }}
        >
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              try {
                await rollbackAction();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Rollback failed");
              }
            });
          }}
        >
          Rollback
        </Button>
      </div>
      {error && <p className="mt-4 text-sm text-off-black">{error}</p>}
      {preview?.ok && preview.lint.length > 0 && (
        <ul className="mt-4 text-sm text-graphite">
          {preview.lint.map((l, i) => (
            <li key={i}>
              [{l.level}] {l.message}
            </li>
          ))}
        </ul>
      )}
      {preview?.ok && preview.compiled && (
        <pre className="mt-4 max-h-64 overflow-auto rounded-[40px] border border-ash p-4 text-xs">
          {preview.compiled.hujson}
        </pre>
      )}
    </Card>
  );
}
