import { connection } from "next/server";
import { redirect } from "next/navigation";
import { liveSession, redirectSignedOut } from "@/lib/auth/live-session";
import { hasOwner } from "@/lib/auth/owner";

export const instant = false;

export default async function HomePage() {
  await connection();
  const session = await liveSession();
  if (session) redirect("/machines");
  redirectSignedOut(await hasOwner());
}
