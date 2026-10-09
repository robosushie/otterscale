import { redirect } from "next/navigation";

export default function EnvironmentsRedirect() {
  redirect("/workspaces");
}
