import { prisma } from "@/lib/db";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!USERNAME_RE.test(trimmed)) {
    return "Username must be 3–32 characters: letters, numbers, . _ -";
  }
  return null;
}

export async function uniqueUsernameFromEmail(email: string): Promise<string> {
  const local = email.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "_") || "user";
  let candidate = local.slice(0, 24).toLowerCase();
  if (candidate.length < 3) candidate = `${candidate}usr`.slice(0, 8);

  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? "" : `_${i}`;
    const username = `${candidate}${suffix}`.slice(0, 32);
    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) return username;
  }
  throw new Error("Could not allocate username");
}
