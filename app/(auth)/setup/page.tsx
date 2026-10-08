import { auth, signIn } from "@/lib/auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuthMethodsPublic } from "@/lib/auth/methods";
import { hasOwner } from "@/lib/auth/owner";
import { getServerEnv } from "@/lib/env";
import { LocalAccountForm } from "@/components/auth/local-account-form";
import { generateSetupTotpSecret, setupOwnerAccount } from "@/lib/actions/auth-local";

export const instant = false;

export default async function SetupPage() {
  await connection();
  const session = await auth();
  if (session?.user) redirect("/workspace");
  if (await hasOwner()) redirect("/signin");

  const methods = getAuthMethodsPublic();
  const env = getServerEnv();
  const needsSetupToken = Boolean(env.AUTH_SETUP_TOKEN);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <h1>Set up Otterscale</h1>
        <p className="mt-4 text-graphite">Create the first Owner account</p>
        <hr className="mt-6 border-0 border-t border-ash" />
        {methods.localAuthEnabled && (
          <LocalAccountForm
            action={setupOwnerAccount}
            prepareTotp={generateSetupTotpSecret}
            submitLabel="Create Owner account"
            showSetupToken={needsSetupToken}
          />
        )}
        {methods.oidcEnabled && (
          <div className={methods.localAuthEnabled ? "mt-8 border-t border-ash pt-8" : "mt-6"}>
            <p className="text-sm text-graphite">Or use SSO for the first Owner sign-in.</p>
            <form
              className="mt-4"
              action={async () => {
                "use server";
                await signIn("oidc", { redirectTo: "/workspace" });
              }}
            >
              <Button type="submit" variant="secondary">
                Continue with SSO
              </Button>
            </form>
          </div>
        )}
      </Card>
    </main>
  );
}
