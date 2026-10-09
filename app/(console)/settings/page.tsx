import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadUserCapabilities } from "@/lib/authz/load-context";

export default async function SettingsRedirect() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ctx = await loadUserCapabilities(session.user.id);
  const caps = ctx?.capabilities ?? [];
  if (caps.includes("platform.view")) redirect("/settings/general");
  if (caps.includes("members.invite")) redirect("/settings/users");
  if (caps.includes("network.manage")) redirect("/settings/devices");
  if (caps.includes("workspace.policy")) redirect("/settings/policy");
  redirect("/machines");
}
