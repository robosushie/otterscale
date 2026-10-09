import { redirect } from "next/navigation";

export const instant = false;

export default function AcceptInvitePage() {
  redirect("/signin?signup=1");
}
