import type { CompileInput } from "@/lib/policy/compiler";

export type LintIssue = { level: "warn" | "error"; message: string };

export function lintPolicyInput(input: CompileInput): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const ws of input.workspaces) {
    if (ws.memberEmails.length === 0) {
      issues.push({
        level: "warn",
        message: `Workspace "${ws.name}" has no human members.`,
      });
    }
  }

  for (const rule of input.extraRules) {
    if (!input.workspaces.some((w) => w.name === rule.srcGroup)) {
      issues.push({
        level: "error",
        message: `Rule references unknown workspace "${rule.srcGroup}".`,
      });
    }
  }

  return issues;
}
