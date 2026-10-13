import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";

export function ExpireKeyButton({ authKey }: { authKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end justify-center">
      <Button
        type="button"
        variant="ghost"
        icon
        aria-label="Delete key"
        disabled={pending || !authKey}
        onClick={() => {
          if (!confirm("Expire this key? Devices can no longer use it to join.")) return;
          const formData = new FormData();
          formData.set("key", authKey);
          startTransition(async () => {
            setError(null);
            try {
              await api.expireKey(authKey);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not expire the key");
            }
          });
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
      {error ? <p className="text-sm text-off-black">{error}</p> : null}
    </div>
  );
}
