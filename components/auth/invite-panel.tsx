"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import type { CreateInviteResult } from "@/lib/actions/members";
import { createUserInvite, revokeUserInvite } from "@/lib/actions/members";

type PendingInvite = {
  id: string;
  email: string;
  username: string;
  tenantRole: string;
  expiresAt: Date;
};

export function InvitePanel({ pendingInvites }: { pendingInvites: PendingInvite[] }) {
  const [lastInvite, setLastInvite] = useState<CreateInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(formData: FormData) {
    setError(null);
    setLastInvite(null);
    startTransition(async () => {
      try {
        const result = await createUserInvite(formData);
        setLastInvite(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create invite");
      }
    });
  }

  return (
    <div>
      <form action={onCreate} className="mt-4 grid gap-3 md:grid-cols-4">
        <input
          name="email"
          type="email"
          placeholder="email@example.com"
          className={`${controlClassName} mt-0`}
          required
        />
        <input
          name="username"
          placeholder="username"
          className={`${controlClassName} mt-0`}
          required
        />
        <select name="tenantRole" className={`${controlClassName} mt-0`} defaultValue="MEMBER">
          <option value="MEMBER">Member</option>
          <option value="TENANT_ADMIN">Tenant admin</option>
          <option value="NET_ADMIN">Net admin</option>
          <option value="AUDITOR">Auditor</option>
        </select>
        <Button type="submit" variant="secondary" disabled={pending}>
          Create invite
        </Button>
      </form>
      {error && <p className="mt-2 text-sm">{error}</p>}
      {lastInvite && (
        <div className="mt-4 rounded-[40px] border border-ash bg-periwinkle-mist p-6 text-sm">
          <p className="font-[540]">Copy this invite code now — it won&apos;t be shown again.</p>
          <p className="mt-2 break-all font-mono">{lastInvite.code}</p>
          <p className="mt-2">
            Link:{" "}
            <a href={lastInvite.acceptPath} className="link">
              {lastInvite.acceptPath}
            </a>
          </p>
        </div>
      )}
      {pendingInvites.length > 0 && (
        <ul className="mt-6 space-y-2 text-sm">
          {pendingInvites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ash py-2">
              <span>
                {inv.email} · @{inv.username} · {inv.tenantRole} · expires{" "}
                {new Date(inv.expiresAt).toLocaleDateString()}
              </span>
              <form action={revokeUserInvite}>
                <input type="hidden" name="inviteId" value={inv.id} />
                <Button type="submit" variant="secondary" className="!min-h-0 !py-1 text-xs">
                  Revoke
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
