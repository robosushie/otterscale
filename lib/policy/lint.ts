import type { CompileInput } from "@/lib/policy/compiler";

export type LintIssue = { level: "warn" | "error"; message: string };

export function lintPolicyInput(input: CompileInput): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const g of input.groups) {
    if (g.memberEmails.length === 0) {
      issues.push({
        level: "warn",
        message: `Group "${g.name}" has no members.`,
      });
    }
  }

  for (const rule of input.rules) {
    if (rule.ports === "*") {
      issues.push({
        level: "warn",
        message: `Rule for group "${rule.groupName}" allows all ports on ${rule.environmentTag}.`,
      });
    }
    if (!input.groups.some((g) => g.name === rule.groupName)) {
      issues.push({
        level: "error",
        message: `Rule references unknown group "${rule.groupName}".`,
      });
    }
  }

  return issues;
}
