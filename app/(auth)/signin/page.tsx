import { auth, signIn } from "@/lib/auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuthMethodsPublic } from "@/lib/auth/methods";
import { hasOwner } from "@/lib/auth/owner";
import { SignInForm } from "@/components/auth/sign-in-form";

export const instant = false;

export default async function SignInPage() {
  await connection();
  const session = await auth();
  if (session?.user) redirect("/workspace");

  const methods = getAuthMethodsPublic();
  if (!methods.oidcEnabled && !methods.localAuthEnabled) {
    throw new Error("No authentication methods are enabled.");
  }

  if (methods.localAuthEnabled && !(await hasOwner())) {
    redirect("/setup");
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <h1>Sign in to Otterscale</h1>
        {methods.oidcEnabled && (
          <>
            <p className="mt-4 text-graphite">Continue with your organisation&apos;s identity provider.</p>
            <form
              className="mt-6"
              action={async () => {
                "use server";
                await signIn("oidc", { redirectTo: "/workspace" });
              }}
            >
              <Button type="submit">Continue with SSO ▸</Button>
            </form>
          </>
        )}
        {methods.localAuthEnabled && (
          <>
            {methods.oidcEnabled && (
              <p className="mt-8 text-sm text-graphite">Or sign in with username and password</p>
            )}
            {!methods.oidcEnabled && (
              <p className="mt-4 text-graphite">Sign in with your username and password.</p>
            )}
            <SignInForm />
          </>
        )}
      </Card>
    </main>
  );
}
