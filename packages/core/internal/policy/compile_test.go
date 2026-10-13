package policy

import "testing"

func TestCompilePolicyIsStable(t *testing.T) {
	input := CompileInput{Workspaces: []CompileWorkspace{{Name: "platform-admins", MemberEmails: []string{"a@b.c"}, WorkspaceTag: "tag:ws-platform-admins"}}}
	first := CompilePolicy(input)
	second := CompilePolicy(input)
	if first.ContentHash == "" || first.ContentHash != second.ContentHash || first.HuJSON == "" {
		t.Fatalf("policy %#v", first)
	}
}
