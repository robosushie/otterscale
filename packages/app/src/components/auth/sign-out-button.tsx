import { api } from "@/api/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full !normal-case tracking-normal"
      onClick={() => {
        void api.signout().finally(() => {
          window.location.href = "/signin";
        });
      }}
    >
      Sign out
    </Button>
  );
}
