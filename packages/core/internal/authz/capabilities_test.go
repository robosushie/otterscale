package authz

import "testing"

func TestOwnerSeesPlatformAndNetwork(t *testing.T) {
	caps := Resolve(Context{PlatformRoles: []string{"OWNER"}, SuperAdminsImplicitTenantAdmin: true})
	for _, want := range []Capability{PlatformSettings, NetworkManage, MembersInvite} {
		if !Has(caps, want) {
			t.Fatalf("missing %s", want)
		}
	}
}

func TestMemberDoesNotManageNetwork(t *testing.T) {
	caps := Resolve(Context{TenantRole: "MEMBER"})
	if !Has(caps, NetworkView) || Has(caps, NetworkManage) {
		t.Fatalf("caps %#v", caps)
	}
}
