import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma, sqliteReady } from "@/lib/db";

/** Session whose user row still exists. A wiped database leaves the JWT cookie behind. */
export async function liveSession() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  await sqliteReady;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return null;
  return session;
}

/** No live session: first owner goes to setup, everyone else to sign-in. */
export function redirectSignedOut(ownerExists: boolean): never {
  if (ownerExists) redirect("/signin");
  redirect("/setup");
}
