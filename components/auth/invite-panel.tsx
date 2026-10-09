"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { Field, Input, Select } from "@/components/ui/field";
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

export function InviteForm({
  workspaces,
  canAssignSuperAdmin,
}: {
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
    <div className="flex flex-col gap-4">
      <form onSubmit={onCreate} className="flex flex-col gap-4">
        <Field label="Email">
          <Input name="email" type="email" placeholder="email@example.com" required />
        </Field>
        <Field label="Username">
          <Input name="username" placeholder="username" required />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="MEMBER">
            {canAssignSuperAdmin ? <option value="SUPER_ADMIN">Super admin</option> : null}
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
          </Select>
        </Field>
        <div className="flex flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
          <span>Workspaces</span>
          <CheckMenu
            key={menuKey}
            name="workspaceIds"
            placeholder="Select workspaces"
            options={workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name }))}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Add user"}
        </Button>
      </form>
      {error ? <p className="text-sm text-off-black">{error}</p> : null}
      {lastInvite ? (
        <div className="rounded-[8px] border border-ash bg-periwinkle-mist p-4 text-sm">
          <p className="font-[540]">Copy this invite code now. It will not be shown again.</p>
          <p className="mt-2 break-all font-mono">{lastInvite.code}</p>
          <p className="mt-2 text-graphite">On the sign-in page, choose Create account and enter this code.</p>
        </div>
      ) : null}
    </div>
  );
}

export function PendingInvitesTable({ pendingInvites }: { pendingInvites: PendingInvite[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (pendingInvites.length === 0 && !error) return null;

  return (
    <section className="mt-10">
      <p className="mb-3 text-[12px] text-smoke">
        {pendingInvites.length} pending {pendingInvites.length === 1 ? "invite" : "invites"}
      </p>
      {error ? <p className="mb-3 text-sm text-off-black">{error}</p> : null}
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Email</th>
            <th>Username</th>
            <th>Role</th>
            <th>Expires</th>
            <th className="actions"></th>
          </tr>
        </thead>
        <tbody>
          {pendingInvites.map((inv) => (
            <tr key={inv.id} className="border-b border-ash">
              <td>
                <div className="cell">{inv.email}</div>
              </td>
              <td>
                <div className="cell">@{inv.username}</div>
              </td>
              <td>
                <div className="cell">{roleLabel(inv)}</div>
              </td>
              <td>
                <div className="cell tabular-nums">{new Date(inv.expiresAt).toLocaleDateString()}</div>
              </td>
              <td className="actions">
                <div className="cell-end">
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
                    <Button type="submit" variant="ghost" disabled={pending}>
                      Revoke
                    </Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
