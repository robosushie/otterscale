import { auth } from "@/lib/auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAuthMethodsPublic } from "@/lib/auth/methods";
import { hasOwner } from "@/lib/auth/owner";
import { BrandMark } from "@/components/brand/lockup";
import { SignInForm } from "@/components/auth/sign-in-form";

export const instant = false;

type Props = {
  searchParams: Promise<{ signup?: string; error?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  await connection();
  const session = await auth();
  if (session?.user) redirect("/machines");

  const methods = getAuthMethodsPublic();
  if (!(await hasOwner())) {
    redirect("/setup");
  }

  const params = await searchParams;
  const notice =
    params.error === "InviteEmailMismatch"
      ? "The SSO account email does not match the invite."
      : null;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size={40} />
        </div>
        <h1>Sign in to Otterscale</h1>
        <p className="mt-4 text-graphite">Enter your email, or continue with SSO.</p>
        <SignInForm
          oidcEnabled={methods.oidcEnabled}
          googleOidcEnabled={methods.googleOidcEnabled}
          startOnCreate={params.signup === "1" && !notice}
          notice={notice}
        />
      </Card>
    </main>
  );
}
