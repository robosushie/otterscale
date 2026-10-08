import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAuthMethodsPublic } from "@/lib/auth/methods";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const instant = false;

type Props = {
  searchParams: Promise<{ email?: string; username?: string }>;
};

export default async function AcceptInvitePage({ searchParams }: Props) {
  const session = await auth();
  if (session?.user) redirect("/workspace");

  const methods = getAuthMethodsPublic();
  if (!methods.localAuthEnabled) {
    throw new Error("Invite acceptance requires local authentication to be enabled.");
  }

  const params = await searchParams;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <h1>Accept invitation</h1>
        <p className="mt-4 text-graphite">
          Enter the invite code from your administrator, choose a password, then enroll an authenticator.
        </p>
        <AcceptInviteForm defaultEmail={params.email ?? ""} defaultUsername={params.username ?? ""} />
      </Card>
    </main>
  );
}
