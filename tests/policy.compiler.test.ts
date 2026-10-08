import { describe, it, expect } from "vitest";
import { compilePolicy } from "@/lib/policy/compiler";

describe("compilePolicy", () => {
  it("produces deterministic output for the same input", () => {
    const input = {
      groups: [{ name: "backend", memberEmails: ["a@example.com", "b@example.com"] }],
      environments: [{ tag: "tag:dev", slug: "dev" }],
      rules: [{ groupName: "backend", environmentTag: "tag:dev", ports: "443" }],
      tagOwnersEmails: ["owner@example.com"],
    };
    const a = compilePolicy(input);
    const b = compilePolicy(input);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.hujson).toBe(b.hujson);
  });
});
