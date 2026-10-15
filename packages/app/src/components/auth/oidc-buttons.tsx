import { useState, useTransition } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { safeNext } from "@/lib/safe-next";

export function OidcButtons({
  oidcEnabled,
  googleOidcEnabled,
  inviteCode,
}: {
  oidcEnabled: boolean;
  googleOidcEnabled: boolean;
  inviteCode?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  function startOidc() {
    setError(null);
    startTransition(async () => {
      const query = new URLSearchParams();
      if (inviteCode) query.set("invite", inviteCode);
      if (next) query.set("next", next);
      const suffix = query.size ? `?${query.toString()}` : "";
      window.location.href = `/api/auth/oidc/start${suffix}`;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!googleOidcEnabled || pending}
        onClick={startOidc}
      >
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={!oidcEnabled || pending}
        onClick={startOidc}
      >
        Continue with OIDC
      </Button>
      {error && <p className="text-center text-sm text-off-black">{error}</p>}
      {!oidcEnabled && (
        <p className="text-center text-[12px] text-smoke">
          OIDC stays disabled until issuer, client id, and client secret are set.
        </p>
      )}
    </div>
  );
}
