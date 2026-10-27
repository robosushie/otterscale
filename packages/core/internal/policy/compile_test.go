package policy

import "testing"

func TestCompilePolicyIsStable(t *testing.T) {
	input := CompileInput{Workspaces: []CompileWorkspace{{Name: "admin", MemberEmails: []string{"a@b.c"}, WorkspaceTag: "tag:ws-admin"}}}
	first := CompilePolicy(input)
	second := CompilePolicy(input)
	if first.ContentHash == "" || first.ContentHash != second.ContentHash || first.HuJSON == "" {
		t.Fatalf("policy %#v", first)
	}
}
