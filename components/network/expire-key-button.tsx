"use client";

import { useState, useTransition } from "react";
import { expireAuthKey } from "@/lib/actions/network";
import { Button } from "@/components/ui/button";

export function ExpireKeyButton({ authKey }: { authKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className="!min-h-0 text-sm"
        disabled={pending || !authKey}
        onClick={() => {
          if (!confirm("Expire this key? Devices can no longer use it to join.")) return;
          const formData = new FormData();
          formData.set("key", authKey);
          startTransition(async () => {
            setError(null);
            const result = await expireAuthKey(formData);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Expiring…" : "Delete"}
      </Button>
      {error ? <p className="text-sm text-off-black">{error}</p> : null}
    </div>
  );
}
