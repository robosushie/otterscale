import { describe, it, expect } from "vitest";
import { generateInviteCode, hashInviteCode, verifyInviteCode } from "@/lib/auth/invite";

describe("invite codes", () => {
  it("hashes and verifies invite code", async () => {
    const code = generateInviteCode();
    const hash = await hashInviteCode(code);
    expect(await verifyInviteCode(code, hash)).toBe(true);
    expect(await verifyInviteCode(code + "x", hash)).toBe(false);
  });
});
