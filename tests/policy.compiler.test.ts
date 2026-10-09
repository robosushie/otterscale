import { describe, it, expect } from "vitest";
import { compilePolicy } from "@/lib/policy/compiler";

const base = {
  tagOwnersEmails: ["owner@example.com"],
  extraRules: [] as { srcGroup: string; destTag: string; ports: string }[],
  tags: [{ aclTag: "tag:prod" }],
};

describe("compilePolicy", () => {
  it("produces deterministic output for the same input", () => {
    const input = {
      ...base,
      workspaces: [
        { name: "backend", memberEmails: ["a@example.com", "b@example.com"], workspaceTag: "tag:ws-backend" },
      ],
    };
    const a = compilePolicy(input);
    const b = compilePolicy(input);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.hujson).toContain("group:backend");
    expect(a.hujson).toContain("tag:prod");
    expect(a.hujson).toContain("tagged-devices");
  });

  it("does not add cross-workspace ACLs", () => {
    const compiled = compilePolicy({
      ...base,
      workspaces: [
        { name: "eng", memberEmails: ["a@example.com"], workspaceTag: "tag:ws-eng" },
        { name: "sales", memberEmails: ["b@example.com"], workspaceTag: "tag:ws-sales" },
      ],
    });
    const doc = JSON.parse(compiled.hujson) as {
      acls: { src: string[]; dst: string[] }[];
    };
    const cross = doc.acls.some(
      (acl) =>
        acl.src.includes("group:eng") && acl.dst.some((d) => d.startsWith("group:sales") || d.startsWith("tag:ws-sales")),
    );
    expect(cross).toBe(false);
    expect(doc.acls.some((acl) => acl.src.includes("group:eng") && acl.dst.some((d) => d.startsWith("tag:ws-eng")))).toBe(
      true,
    );
  });

  it("allows peers that share a workspace", () => {
    const compiled = compilePolicy({
      ...base,
      workspaces: [
        {
          name: "eng",
          memberEmails: ["a@example.com", "b@example.com"],
          workspaceTag: "tag:ws-eng",
        },
      ],
    });
    const doc = JSON.parse(compiled.hujson) as {
      groups: Record<string, string[]>;
      acls: { src: string[]; dst: string[] }[];
    };
    expect(doc.groups["group:eng"]).toEqual(["a@example.com", "b@example.com"]);
    expect(
      doc.acls.some(
        (acl) => acl.src.includes("group:eng") && acl.dst.includes("tag:ws-eng:*"),
      ),
    ).toBe(true);
  });

  it("includes custom tags in tagOwners", () => {
    const compiled = compilePolicy({
      ...base,
      workspaces: [{ name: "eng", memberEmails: ["a@example.com"], workspaceTag: "tag:ws-eng" }],
      tags: [{ aclTag: "tag:prod" }, { aclTag: "tag:custom" }],
    });
    const doc = JSON.parse(compiled.hujson) as { tagOwners: Record<string, string[]> };
    expect(doc.tagOwners["tag:custom"]).toContain("tagged-devices");
    expect(doc.tagOwners["tag:prod"]).toContain("owner@example.com");
    expect(doc.tagOwners["tag:ws-eng"]).toContain("tagged-devices");
  });
});
