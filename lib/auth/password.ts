import { hash, verify } from "@node-rs/argon2";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

export { PASSWORD_MIN_LENGTH };

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function validatePasswordPolicy(plain: string): string | null {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}
