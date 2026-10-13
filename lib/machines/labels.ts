import { workspaceTagName } from "@/lib/console/user-role";

const EDGE_TAG = "tag:edge";

/** Map Headscale ACL tags from an auth key onto console workspaces and tags. */
export function matchAclLabels(
  aclTags: string[],
  workspaces: { id: string; name: string }[],
  tags: { id: string; aclTag: string }[],
): { workspaceIds: string[]; tagIds: string[] } {
  const wanted = new Set(aclTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag !== EDGE_TAG));
  return {
    workspaceIds: workspaces.filter((workspace) => wanted.has(workspaceTagName(workspace.name))).map((workspace) => workspace.id),
    tagIds: tags.filter((tag) => tag.aclTag !== EDGE_TAG && wanted.has(tag.aclTag)).map((tag) => tag.id),
  };
}
