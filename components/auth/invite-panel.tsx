"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { controlClassName } from "@/components/ui/field";
import type { CreateInviteResult } from "@/lib/actions/members";
import { createUserInvite, revokeUserInvite } from "@/lib/actions/members";

type PendingInvite = {
  id: string;
  email: string;
  username: string;
  tenantRole: string;
  platformRole: string | null;
  expiresAt: Date;
};

function roleLabel(invite: PendingInvite) {
  if (invite.platformRole === "SUPER_ADMIN") return "Super admin";
  if (invite.tenantRole === "ADMIN") return "Admin";
  return "Member";
}

export function InvitePanel({
  pendingInvites,
  workspaces,
  canAssignSuperAdmin,
}: {
  pendingInvites: PendingInvite[];
  workspaces: { id: string; name: string }[];
  canAssignSuperAdmin: boolean;
}) {
  const [lastInvite, setLastInvite] = useState<CreateInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setLastInvite(null);
    startTransition(async () => {
      const result = await createUserInvite(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastInvite(result.data);
      form.reset();
      setMenuKey((key) => key + 1);
    });
  }

  return (
    <div>
      <form onSubmit={onCreate} className="mt-4 flex flex-wrap items-end gap-3">
        <input
          name="email"
          type="email"
          placeholder="email@example.com"
          className={`${controlClassName} mt-0 w-56`}
          required
        />
        <input
          name="username"
          placeholder="username"
          className={`${controlClassName} mt-0 w-40`}
          required
        />
        <select name="role" className={`${controlClassName} mt-0 w-40`} defaultValue="MEMBER">
          {canAssignSuperAdmin ? <option value="SUPER_ADMIN">Super admin</option> : null}
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
        </select>
        <div className="w-56">
          <CheckMenu
            key={menuKey}
            name="workspaceIds"
            placeholder="Workspaces"
            options={workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name }))}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Create invite
        </Button>
      </form>
      {error && <p className="mt-2 text-sm">{error}</p>}
      {lastInvite && (
        <div className="mt-4 rounded-[8px] border border-ash bg-periwinkle-mist p-4 text-sm">
          <p className="font-[540]">Copy this invite code now. It will not be shown again.</p>
          <p className="mt-2 break-all font-mono">{lastInvite.code}</p>
          <p className="mt-2 text-graphite">
            On the sign-in page, choose Create account and enter this code.
          </p>
        </div>
      )}
      {pendingInvites.length > 0 && (
        <ul className="mt-6 space-y-2 text-sm">
          {pendingInvites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ash py-2">
              <span>
                {inv.email} · @{inv.username} · {roleLabel(inv)} · expires{" "}
                {new Date(inv.expiresAt).toLocaleDateString()}
              </span>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  startTransition(async () => {
                    const result = await revokeUserInvite(formData);
                    if (!result.ok) setError(result.error);
                  });
                }}
              >
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
