"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { acceptInviteAccount, prepareInviteTotp } from "@/lib/actions/auth-local";

type Props = {
  defaultEmail?: string;
  defaultUsername?: string;
};

type Step = "account" | "totp";

export function AcceptInviteForm({ defaultEmail = "", defaultUsername = "" }: Props) {
  const [step, setStep] = useState<Step>("account");
  const [error, setError] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [account, setAccount] = useState({
    inviteCode: "",
    email: defaultEmail,
    username: defaultUsername,
    password: "",
    confirmPassword: "",
  });

  async function goToAuthenticator() {
    setError(null);
    if (!account.inviteCode.trim() || !account.username.trim() || !account.email.trim()) {
      setError("Invite code, username, and email are required.");
      return;
    }
    if (account.password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (account.password !== account.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      const { secret, uri } = await prepareInviteTotp(account.username.trim());
      setTotpSecret(secret);
      const url = await QRCode.toDataURL(uri, {
        margin: 1,
        width: 220,
        color: { dark: "#242424", light: "#0000" },
      });
      setQrDataUrl(url);
      setStep("totp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate authenticator secret");
    }
  }

  function onSubmit(formData: FormData) {
    setError(null);
    if (step !== "totp" || !totpSecret) {
      setError("Scan the authenticator QR and enter a code first.");
      return;
    }
    formData.set("totpSecret", totpSecret);
    formData.set("inviteCode", account.inviteCode);
    formData.set("username", account.username);
    formData.set("email", account.email);
    formData.set("password", account.password);
    formData.set("confirmPassword", account.confirmPassword);
    startTransition(async () => {
      try {
        await acceptInviteAccount(formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    });
  }

  return (
    <form action={onSubmit} className="mt-8 flex flex-col gap-4 text-left">
      <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">
        {step === "account" ? "1 / 2  Account" : "2 / 2  Authenticator"}
      </p>

      {step === "account" && (
        <>
          <Field label="Invite code">
            <Input
              name="inviteCode"
              value={account.inviteCode}
              onChange={(e) => setAccount((a) => ({ ...a, inviteCode: e.target.value }))}
              required
            />
          </Field>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              value={account.email}
              onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              required
            />
          </Field>
          <Field label="Username">
            <Input
              name="username"
              value={account.username}
              onChange={(e) => setAccount((a) => ({ ...a, username: e.target.value }))}
              required
            />
          </Field>
          <Field label="Password" hint="At least 12 characters.">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              value={account.password}
              onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
              required
              minLength={12}
            />
          </Field>
          <Field label="Confirm password">
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={account.confirmPassword}
              onChange={(e) => setAccount((a) => ({ ...a, confirmPassword: e.target.value }))}
              required
              minLength={12}
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button
            type="button"
            className="w-full"
            onClick={() => startTransition(() => void goToAuthenticator())}
          >
            Continue ▸
          </Button>
        </>
      )}

      {step === "totp" && (
        <>
          <p className="text-graphite">
            Scan this QR with your authenticator app, then enter a 6-digit code to finish.
          </p>
          {qrDataUrl && (
            <div className="flex justify-center py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Authenticator QR code" width={220} height={220} />
            </div>
          )}
          <Field label="Authenticator code">
            <Input name="totpCode" inputMode="numeric" autoComplete="one-time-code" required />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <div className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating account…" : "Create account ▸"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setError(null);
                setStep("account");
              }}
            >
              Back
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
