"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signInWithOidc, startInviteOidc } from "@/lib/actions/auth-local";

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

  function startOidc() {
    setError(null);
    startTransition(async () => {
      const result = inviteCode ? await startInviteOidc(inviteCode) : await signInWithOidc();
      if (!result.ok) setError(result.error);
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
