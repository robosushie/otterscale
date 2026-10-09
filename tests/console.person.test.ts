import { describe, expect, it } from "vitest";
import { formatPerson } from "@/lib/console/person";

describe("formatPerson", () => {
  it("prefers name, then username, then email", () => {
    expect(formatPerson({ name: "Ada", username: "ada", email: "ada@example.com" })).toBe("Ada");
    expect(formatPerson({ name: "  ", username: "ada", email: "ada@example.com" })).toBe("ada");
    expect(formatPerson({ name: null, username: null, email: "ada@example.com" })).toBe("ada@example.com");
  });

  it("returns an em dash when no identity is present", () => {
    expect(formatPerson(null)).toBe("—");
    expect(formatPerson({})).toBe("—");
  });
});
