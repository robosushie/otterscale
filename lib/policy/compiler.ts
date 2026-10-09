import { createHash } from "crypto";

export type CompileWorkspace = {
  name: string;
  memberEmails: string[];
  workspaceTag: string;
};

export type CompileTag = {
  aclTag: string;
};

export type CompileExtraRule = {
  srcGroup: string;
  destTag: string;
  ports: string;
};

export type CompileInput = {
  workspaces: CompileWorkspace[];
  tags: CompileTag[];
  extraRules: CompileExtraRule[];
  tagOwnersEmails: string[];
  edgeTag?: string;
  appDestinations?: { dest: string }[];
};

export type CompiledPolicy = {
  hujson: string;
  contentHash: string;
  groups: Record<string, string[]>;
};

export function compilePolicy(input: CompileInput): CompiledPolicy {
  const groups: Record<string, string[]> = {};
  for (const ws of input.workspaces) {
    groups[`group:${ws.name}`] = [...ws.memberEmails].sort();
  }

  const ownerPrincipals = [
    "tagged-devices",
    ...input.tagOwnersEmails,
  ];
  if (groups["group:platform-admins"]?.length) {
    ownerPrincipals.push("group:platform-admins");
  }

  const tagOwners: Record<string, string[]> = {};
  for (const ws of input.workspaces) {
    tagOwners[ws.workspaceTag] = [...new Set(ownerPrincipals)];
  }
  for (const tag of input.tags) {
    tagOwners[tag.aclTag] = [...new Set(ownerPrincipals)];
  }
  if (input.edgeTag) {
    tagOwners[input.edgeTag] = [...new Set(ownerPrincipals)];
  }

  const acls: Array<{ action: string; src: string[]; dst: string[] }> = [];
  for (const ws of input.workspaces) {
    acls.push({
      action: "accept",
      src: [`group:${ws.name}`, ws.workspaceTag],
      dst: [`group:${ws.name}:*`, `${ws.workspaceTag}:*`],
    });
  }
  for (const rule of input.extraRules) {
    acls.push({
      action: "accept",
      src: [`group:${rule.srcGroup}`],
      dst: [`${rule.destTag}:${rule.ports}`],
    });
  }
  if (input.edgeTag && input.appDestinations?.length) {
    acls.push({
      action: "accept",
      src: [input.edgeTag],
      dst: input.appDestinations.map((d) => d.dest),
    });
  }

  const tests: Array<{ src: string; accept?: string[] }> = [];
  for (const ws of input.workspaces.slice(0, 5)) {
    const member = ws.memberEmails[0];
    if (member) {
      tests.push({ src: member, accept: [`${ws.workspaceTag}:443`] });
    }
  }

  const doc = { groups, tagOwners, acls, tests };
  const hujson = JSON.stringify(doc, null, 2);
  const contentHash = createHash("sha256").update(hujson).digest("hex");
  return { hujson, contentHash, groups };
}
