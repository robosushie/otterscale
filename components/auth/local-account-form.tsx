"use client";

import { useState, useTransition, type FormEvent } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OidcButtons } from "@/components/auth/oidc-buttons";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import type { ActionResult } from "@/lib/actions/result";

type TotpPrepare = (username: string) => Promise<ActionResult<{ secret: string; uri: string }>>;

type Props = {
  action: (formData: FormData) => Promise<ActionResult<void>>;
  prepareTotp: TotpPrepare;
  submitLabel: string;
  defaultEmail?: string;
  defaultUsername?: string;
  usernameReadOnly?: boolean;
  showSetupToken?: boolean;
  oidcEnabled?: boolean;
  googleOidcEnabled?: boolean;
  showOidc?: boolean;
};

type Step = "email" | "password" | "totp";

export function LocalAccountForm({
  action,
  prepareTotp,
  submitLabel,
  defaultEmail = "",
  defaultUsername = "",
  usernameReadOnly = false,
  showSetupToken = false,
  oidcEnabled = false,
  googleOidcEnabled = false,
  showOidc = true,
}: Props) {
  const [step, setStep] = useState<Step>(defaultEmail ? "password" : "email");
  const [error, setError] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [account, setAccount] = useState({
    setupToken: "",
    username: defaultUsername,
    email: defaultEmail,
    password: "",
    confirmPassword: "",
  });

  async function goToAuthenticator() {
    setError(null);
    if (!account.username.trim() || !account.email.trim()) {
      setError("Username and email are required.");
      return;
    }
    if (account.password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (account.password !== account.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const prepared = await prepareTotp(account.username.trim());
    if (!prepared.ok) {
      setError(prepared.error);
      return;
    }
    const { secret, uri } = prepared.data;
    setTotpSecret(secret);
    const url = await QRCode.toDataURL(uri, {
      margin: 1,
      width: 220,
      color: { dark: "#242424", light: "#0000" },
    });
    setQrDataUrl(url);
    setStep("totp");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (step !== "totp" || !totpSecret) {
      setError("Scan the authenticator QR and enter a code first.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("totpSecret", totpSecret);
    formData.set("username", account.username);
    formData.set("email", account.email);
    formData.set("password", account.password);
    formData.set("confirmPassword", account.confirmPassword);
    if (showSetupToken) formData.set("setupToken", account.setupToken);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) setError(result.error || "Request failed");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4 text-left">
      <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">
        {step === "email"
          ? "1 / 3  Email"
          : step === "password"
            ? "2 / 3  Username and password"
            : "3 / 3  Authenticator"}
      </p>

      {step === "email" && (
        <>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              value={account.email}
              onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              required
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setError(null);
              if (!account.email.trim().includes("@")) {
                setError("Enter a valid email.");
                return;
              }
              if (!account.username) {
                setAccount((a) => ({ ...a, username: a.email.split("@")[0] ?? a.username }));
              }
              setStep("password");
            }}
          >
            Continue ▸
          </Button>
          {showOidc && (
            <>
              <div className="relative py-2 text-center text-[12px] uppercase tracking-[-0.4px] text-smoke">
                or
              </div>
              <OidcButtons oidcEnabled={oidcEnabled} googleOidcEnabled={googleOidcEnabled} />
            </>
          )}
        </>
      )}

      {step === "password" && (
        <>
          {showSetupToken && (
            <Field label="Setup token">
              <Input
                name="setupToken"
                value={account.setupToken}
                onChange={(e) => setAccount((a) => ({ ...a, setupToken: e.target.value }))}
              />
            </Field>
          )}
          <Field label="Username">
            <Input
              name="username"
              value={account.username}
              readOnly={usernameReadOnly}
              onChange={(e) => setAccount((a) => ({ ...a, username: e.target.value }))}
              required
            />
          </Field>
          <Field label="Password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              value={account.password}
              onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
              required
              minLength={PASSWORD_MIN_LENGTH}
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
              minLength={PASSWORD_MIN_LENGTH}
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => startTransition(() => void goToAuthenticator())}
            >
              Continue ▸
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setError(null);
                setStep("email");
              }}
            >
              Back
            </Button>
          </div>
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
              {pending ? "Working…" : `${submitLabel} ▸`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setError(null);
                setStep("password");
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
