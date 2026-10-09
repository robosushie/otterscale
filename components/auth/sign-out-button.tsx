import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <Button type="submit" variant="ghost" className="w-full !normal-case tracking-normal">
        Sign out
      </Button>
    </form>
  );
}
