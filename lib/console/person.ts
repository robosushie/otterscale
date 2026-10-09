export function formatPerson(
  user: { name?: string | null; username?: string | null; email?: string | null } | null | undefined,
): string {
  const name = user?.name?.trim();
  if (name) return name;
  if (user?.username?.trim()) return user.username.trim();
  if (user?.email?.trim()) return user.email.trim();
  return "—";
}
