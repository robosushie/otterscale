import { useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/brand/lockup";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Card } from "@/components/ui/card";

export function SignInPage({ oidc, google }: { oidc: boolean; google: boolean }) {
  const [params] = useSearchParams();
  const notice = params.get("error") === "InviteEmailMismatch" ? "The SSO account email does not match the invite." : null;
  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size={40} />
        </div>
        <h1>Sign in to Otterscale</h1>
        <p className="mt-4 text-graphite">Enter your email, or continue with SSO.</p>
        <SignInForm
          oidcEnabled={oidc}
          googleOidcEnabled={google}
          startOnCreate={params.get("signup") === "1" && !notice}
          notice={notice}
        />
      </Card>
    </main>
  );
}
