"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OidcButtons } from "@/components/auth/oidc-buttons";
import { CreateAccountForm } from "@/components/auth/create-account-form";
import { resolveLocalIdentity, signInWithCredentials } from "@/lib/actions/auth-local";

type Step = "email" | "password" | "totp";

export function SignInForm({
  oidcEnabled,
  googleOidcEnabled,
  startOnCreate = false,
  notice,
}: {
  oidcEnabled: boolean;
  googleOidcEnabled: boolean;
  startOnCreate?: boolean;
  notice?: string | null;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(startOnCreate ? "signup" : "signin");
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [account, setAccount] = useState({ email: "", username: "", password: "" });

  function submit(totpCode?: string) {
    setError(null);
    const formData = new FormData();
    formData.set("username", account.username || account.email);
    formData.set("password", account.password);
    if (totpCode) formData.set("totpCode", totpCode);
    startTransition(async () => {
      const result = await signInWithCredentials(formData);
      if (result.ok) return;
      if (result.totpRequired) {
        setStep("totp");
        setError(null);
        return;
      }
      setError(result.error || "Sign-in failed");
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") return;
    if (step === "password") {
      submit();
      return;
    }
    const formData = new FormData(event.currentTarget);
    submit(String(formData.get("totpCode") ?? ""));
  }

  if (mode === "signup") {
    return (
      <CreateAccountForm
        oidcEnabled={oidcEnabled}
        googleOidcEnabled={googleOidcEnabled}
        onCancel={() => setMode("signin")}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4 text-left">
      {notice ? <p className="text-sm text-off-black">{notice}</p> : null}
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
              autoComplete="email"
              value={account.email}
              onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              required
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setError(null);
              const email = account.email.trim();
              if (!email.includes("@")) {
                setError("Enter a valid email.");
                return;
              }
              startTransition(async () => {
                const username = await resolveLocalIdentity(email);
                setAccount((a) => ({ ...a, username: username || a.username }));
                setStep("password");
              });
            }}
          >
            Continue ▸
          </Button>
          <div className="relative py-2 text-center text-[12px] uppercase tracking-[-0.4px] text-smoke">
            or
          </div>
          <OidcButtons oidcEnabled={oidcEnabled} googleOidcEnabled={googleOidcEnabled} />
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("signup")}>
            Create account
          </Button>
        </>
      )}

      {step === "password" && (
        <>
          <Field label="Username">
            <Input
              name="username"
              autoComplete="username"
              value={account.username}
              onChange={(e) => setAccount((a) => ({ ...a, username: e.target.value }))}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              value={account.password}
              onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
              required
              minLength={8}
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <div className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Continue ▸"}
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
          <p className="text-graphite">Enter the 6-digit code from your authenticator app.</p>
          <Field label="Authenticator code">
            <Input name="totpCode" inputMode="numeric" autoComplete="one-time-code" required />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <div className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in ▸"}
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
