import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, validatePasswordPolicy } from "@/lib/auth/password";

describe("password policy", () => {
  it("requires at least 8 characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePasswordPolicy("1234567")).toMatch(/8/);
    expect(validatePasswordPolicy("12345678")).toBeNull();
  });
});
