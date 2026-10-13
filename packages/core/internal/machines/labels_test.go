package machines

import "testing"

func TestWorkspaceTagAndVisibility(t *testing.T) {
	if got := WorkspaceTagName("platform-admins"); got != "tag:ws-platform-admins" {
		t.Fatalf("tag %s", got)
	}
	ws, tags := MatchACLLabels(
		[]string{"tag:ws-platform-admins", "tag:prod", "tag:edge"},
		[]Named{{ID: "g1", Name: "platform-admins"}},
		[]Tagged{{ID: "t1", ACLTag: "tag:prod"}, {ID: "t2", ACLTag: "tag:edge"}},
	)
	if len(ws) != 1 || ws[0] != "g1" || len(tags) != 1 || tags[0] != "t1" {
		t.Fatalf("labels %#v %#v", ws, tags)
	}
	if MachineVisible(nil, false, []string{"g1"}) {
		t.Fatal("unassigned machine should be hidden")
	}
	if !IsEdgeMachine("edge", "", nil) {
		t.Fatal("edge hostname")
	}
}
