import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export function generateInviteCode(): string {
  return randomBytes(24).toString("base64url");
}

export async function hashInviteCode(code: string): Promise<string> {
  return hashPassword(code);
}

export async function verifyInviteCode(code: string, codeHash: string): Promise<boolean> {
  return verifyPassword(code, codeHash);
}
