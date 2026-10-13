import { describe, expect, it } from "vitest";
import { collectNodeTags } from "@/lib/headscale/client";
import { matchAclLabels } from "@/lib/machines/labels";

describe("auth key labels", () => {
  it("maps workspace and tag ACL tags and ignores the edge tag", () => {
    const matched = matchAclLabels(
      ["tag:ws-eng", "tag:prod", "tag:edge"],
      [
        { id: "ws-eng", name: "Eng" },
        { id: "ws-sales", name: "Sales" },
      ],
      [
        { id: "tag-prod", aclTag: "tag:prod" },
        { id: "tag-edge", aclTag: "tag:edge" },
      ],
    );
    expect(matched.workspaceIds).toEqual(["ws-eng"]);
    expect(matched.tagIds).toEqual(["tag-prod"]);
  });

  it("reads tags from every Headscale field name", () => {
    expect(
      collectNodeTags({
        validTags: ["tag:ws-eng"],
        preAuthKey: { aclTags: ["tag:prod"] },
        forcedTags: [],
      }),
    ).toEqual(["tag:ws-eng", "tag:prod"]);
  });
});
