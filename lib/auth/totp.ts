import { TOTP, Secret } from "otpauth";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";

const ISSUER = "Otterscale";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotpUri(secret: string, username: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return totp.toString();
}

export function verifyTotpCode(secretPlain: string, code: string): boolean {
  const totp = new TOTP({
    secret: secretPlain,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export function encryptTotpSecret(plain: string, authSecret: string): string {
  return encryptSecret(plain, authSecret);
}

export function verifyStoredTotp(
  encryptedSecret: string,
  code: string,
  authSecret: string,
): boolean {
  const plain = decryptSecret(encryptedSecret, authSecret);
  return verifyTotpCode(plain, code);
}
