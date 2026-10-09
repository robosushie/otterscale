"use client";

import { useState, useTransition, type FormEvent } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OidcButtons } from "@/components/auth/oidc-buttons";
import { acceptInviteAccount, lookupInviteCode, prepareInviteTotp } from "@/lib/actions/auth-local";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

type Step = "code" | "password" | "totp";

export function CreateAccountForm({
  oidcEnabled,
  googleOidcEnabled,
  onCancel,
}: {
  oidcEnabled: boolean;
  googleOidcEnabled: boolean;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("code");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  function lookup() {
    setError(null);
    const code = inviteCode.trim();
    if (!code) {
      setError("Enter the invite code.");
      return;
    }
    startTransition(async () => {
      const result = await lookupInviteCode(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail(result.data.email);
      setUsername(result.data.username);
      setStep("password");
    });
  }

  function enroll() {
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    startTransition(async () => {
      const prepared = await prepareInviteTotp(username);
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      setTotpSecret(prepared.data.secret);
      const url = await QRCode.toDataURL(prepared.data.uri, {
        margin: 1,
        width: 220,
        color: { dark: "#242424", light: "#0000" },
      });
      setQrDataUrl(url);
      setStep("totp");
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "totp" || !totpSecret) return;
    const formData = new FormData(event.currentTarget);
    formData.set("totpSecret", totpSecret);
    formData.set("inviteCode", inviteCode.trim());
    formData.set("username", username);
    formData.set("email", email);
    formData.set("password", password);
    formData.set("confirmPassword", confirmPassword);
    setError(null);
    startTransition(async () => {
      const result = await acceptInviteAccount(formData);
      if (!result.ok) setError(result.error || "Could not create the account.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4 text-left">
      <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">
        {step === "code" ? "Invite code" : step === "password" ? "Password" : "Authenticator"}
      </p>

      {step === "code" && (
        <>
          <Field label="Invite code">
            <Input
              name="inviteCode"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              autoComplete="off"
              required
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button type="button" className="w-full" disabled={pending} onClick={lookup}>
            {pending ? "Checking…" : "Continue ▸"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
            Back to sign in
          </Button>
        </>
      )}

      {step === "password" && (
        <>
          <Field label="Email">
            <Input value={email} readOnly />
          </Field>
          <Field label="Username">
            <Input value={username} readOnly />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              required
            />
          </Field>
          <Field label="Confirm password">
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button type="button" className="w-full" disabled={pending} onClick={enroll}>
            {pending ? "Preparing…" : "Continue ▸"}
          </Button>
          {(oidcEnabled || googleOidcEnabled) && (
            <>
              <div className="relative py-2 text-center text-[12px] uppercase tracking-[-0.4px] text-smoke">
                or
              </div>
              <OidcButtons
                oidcEnabled={oidcEnabled}
                googleOidcEnabled={googleOidcEnabled}
                inviteCode={inviteCode.trim()}
              />
            </>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("code")}>
            Back
          </Button>
        </>
      )}

      {step === "totp" && (
        <>
          <p className="text-graphite">Scan this code in your authenticator app, then enter the 6-digit code.</p>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Authenticator QR code" width={220} height={220} className="mx-auto" />
          ) : null}
          <Field label="Authenticator code">
            <Input name="totpCode" inputMode="numeric" autoComplete="one-time-code" required />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create account ▸"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("password")}>
            Back
          </Button>
        </>
      )}
    </form>
  );
}
