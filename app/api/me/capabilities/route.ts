import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadUserCapabilities } from "@/lib/authz/load-context";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(ctx);
}
