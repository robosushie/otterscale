import { createHash } from "crypto";

export type CompileGroup = {
  name: string;
  memberEmails: string[];
};

export type CompileEnvironment = {
  tag: string;
  slug: string;
};

export type CompileRule = {
  groupName: string;
  environmentTag: string;
  ports: string;
};

export type CompileInput = {
  groups: CompileGroup[];
  environments: CompileEnvironment[];
  rules: CompileRule[];
  tagOwnersEmails: string[];
};

export type CompiledPolicy = {
  hujson: string;
  contentHash: string;
  groups: Record<string, string[]>;
};

export function compilePolicy(input: CompileInput): CompiledPolicy {
  const groups: Record<string, string[]> = {};
  for (const g of input.groups) {
    const key = `group:${g.name}`;
    groups[key] = [...g.memberEmails].sort();
  }

  const tagOwners: Record<string, string[]> = {};
  const ownerPrincipals = input.tagOwnersEmails.length
    ? input.tagOwnersEmails.map((e) => e)
    : ["group:platform-admins"];

  for (const env of input.environments) {
    tagOwners[env.tag] = ownerPrincipals;
  }

  const acls: Array<{ action: string; src: string[]; dst: string[] }> = [];
  for (const rule of input.rules) {
    acls.push({
      action: "accept",
      src: [`group:${rule.groupName}`],
      dst: [`${rule.environmentTag}:${rule.ports}`],
    });
  }

  const tests: Array<{ src: string; accept?: string[]; deny?: string[] }> = [];
  for (const rule of input.rules.slice(0, 5)) {
    const member = input.groups.find((g) => g.name === rule.groupName)?.memberEmails[0];
    if (member) {
      tests.push({
        src: member,
        accept: [`${rule.environmentTag}:443`],
      });
    }
  }

  const doc = {
    groups,
    tagOwners,
    acls,
    tests,
  };

  const hujson = JSON.stringify(doc, null, 2);
  const contentHash = createHash("sha256").update(hujson).digest("hex");

  return { hujson, contentHash, groups };
}
