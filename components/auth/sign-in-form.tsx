"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signInWithCredentials } from "@/lib/actions/auth-local";

type Step = "account" | "totp";

export function SignInForm() {
  const [step, setStep] = useState<Step>("account");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [account, setAccount] = useState({ username: "", password: "" });

  function submit(totpCode?: string) {
    setError(null);
    const formData = new FormData();
    formData.set("username", account.username);
    formData.set("password", account.password);
    if (totpCode) formData.set("totpCode", totpCode);
    startTransition(async () => {
      try {
        await signInWithCredentials(formData);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sign-in failed";
        if (msg === "TOTP_REQUIRED") {
          setStep("totp");
          setError(null);
          return;
        }
        setError(msg === "CredentialsSignin" ? "Invalid username, password, or authenticator code." : msg);
      }
    });
  }

  function onSubmit(formData: FormData) {
    if (step === "account") {
      submit();
      return;
    }
    submit(String(formData.get("totpCode") ?? ""));
  }

  return (
    <form action={onSubmit} className="mt-8 flex flex-col gap-4 text-left">
      {step === "account" && (
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
            />
          </Field>
          {error && <p className="text-sm text-off-black">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Continue ▸"}
          </Button>
        </>
      )}

      {step === "totp" && (
        <>
          <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">2 / 2  Authenticator</p>
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
