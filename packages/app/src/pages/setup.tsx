import { api } from "@/api/client";
import { asResult } from "@/api/result";
import { BrandMark } from "@/components/brand/lockup";
import { LocalAccountForm } from "@/components/auth/local-account-form";
import { Card } from "@/components/ui/card";

export function SetupPage({ oidc, google }: { oidc: boolean; google: boolean }) {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size={40} />
        </div>
        <h1>Set up Otterscale</h1>
        <p className="mt-4 text-graphite">Create the first Owner account</p>
        <hr className="mt-6 border-0 border-t border-ash" />
        <LocalAccountForm
          action={(formData) =>
            asResult(() =>
              api.setup({
                username: String(formData.get("username") ?? ""),
                email: String(formData.get("email") ?? ""),
                password: String(formData.get("password") ?? ""),
                confirmPassword: String(formData.get("confirmPassword") ?? ""),
                totpCode: String(formData.get("totpCode") ?? ""),
                totpSecret: String(formData.get("totpSecret") ?? ""),
                setupToken: String(formData.get("setupToken") ?? ""),
              }),
            ).then((result) => {
              if (result.ok) {
                window.location.href = "/dashboard";
                return { ok: true as const, data: undefined };
              }
              return result;
            })
          }
          prepareTotp={(username) => asResult(() => api.totp(username))}
          submitLabel="Create Owner account"
          oidcEnabled={oidc}
          googleOidcEnabled={google}
        />
      </Card>
    </main>
  );
}
