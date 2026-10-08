import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const instant = false;

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/workspace");
  redirect("/signin");
}
