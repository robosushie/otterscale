package policy

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

type CompileWorkspace struct {
	Name         string
	MemberEmails []string
	WorkspaceTag string
}

type CompileInput struct {
	Workspaces      []CompileWorkspace
	Tags            []string
	ExtraRules      []CompileRule
	TagOwnerEmails  []string
	EdgeTag         string
	AppDestinations []string
}

type CompileRule struct {
	SrcGroup string
	DestTag  string
	Ports    string
}

type CompiledPolicy struct {
	HuJSON      string
	ContentHash string
}

func CompilePolicy(input CompileInput) CompiledPolicy {
	groups := map[string][]string{}
	for _, ws := range input.Workspaces {
		emails := append([]string{}, ws.MemberEmails...)
		sortStrings(emails)
		groups["group:"+ws.Name] = emails
	}
	owners := []string{"tagged-devices"}
	owners = append(owners, input.TagOwnerEmails...)
	if len(groups["group:admin"]) > 0 {
		owners = append(owners, "group:admin")
	}
	owners = unique(owners)
	tagOwners := map[string][]string{}
	for _, ws := range input.Workspaces {
		tagOwners[ws.WorkspaceTag] = owners
	}
	for _, tag := range input.Tags {
		tagOwners[tag] = owners
	}
	if input.EdgeTag != "" {
		tagOwners[input.EdgeTag] = owners
	}
	type acl struct {
		Action string   `json:"action"`
		Src    []string `json:"src"`
		Dst    []string `json:"dst"`
	}
	var acls []acl
	for _, ws := range input.Workspaces {
		acls = append(acls, acl{
			Action: "accept",
			Src:    []string{"group:" + ws.Name, ws.WorkspaceTag},
			Dst:    []string{"group:" + ws.Name + ":*", ws.WorkspaceTag + ":*"},
		})
	}
	for _, rule := range input.ExtraRules {
		acls = append(acls, acl{
			Action: "accept",
			Src:    []string{"group:" + rule.SrcGroup},
			Dst:    []string{rule.DestTag + ":" + rule.Ports},
		})
	}
	if input.EdgeTag != "" && len(input.AppDestinations) > 0 {
		acls = append(acls, acl{Action: "accept", Src: []string{input.EdgeTag}, Dst: input.AppDestinations})
	}
	if acls == nil {
		acls = []acl{}
	}
	type test struct {
		Src    string   `json:"src"`
		Accept []string `json:"accept,omitempty"`
	}
	var tests []test
	limit := len(input.Workspaces)
	if limit > 5 {
		limit = 5
	}
	for _, ws := range input.Workspaces[:limit] {
		if len(ws.MemberEmails) == 0 {
			continue
		}
		tests = append(tests, test{Src: ws.MemberEmails[0], Accept: []string{ws.WorkspaceTag + ":443"}})
	}
	if tests == nil {
		tests = []test{}
	}
	doc := map[string]any{"groups": groups, "tagOwners": tagOwners, "acls": acls, "tests": tests}
	raw, _ := json.MarshalIndent(doc, "", "  ")
	sum := sha256.Sum256(raw)
	return CompiledPolicy{HuJSON: string(raw), ContentHash: hex.EncodeToString(sum[:])}
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		j := i
		for j > 0 && values[j] < values[j-1] {
			values[j], values[j-1] = values[j-1], values[j]
			j--
		}
	}
}

func unique(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, v := range values {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}
