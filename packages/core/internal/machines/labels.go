package machines

import (
	"regexp"
	"strings"
)

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)
var nonTag = regexp.MustCompile(`[^a-z0-9-]+`)

func WorkspaceTagName(name string) string {
	slug := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if slug == "" {
		slug = "workspace"
	}
	return "tag:ws-" + slug
}

func ACLTagForSlug(slug string) string {
	clean := strings.TrimPrefix(nonTag.ReplaceAllString(strings.ToLower(slug), ""), "tag:")
	return "tag:" + clean
}

const EdgeTag = "tag:edge"

func MatchACLLabels(aclTags []string, workspaces []Named, tags []Tagged) (workspaceIDs, tagIDs []string) {
	wanted := map[string]struct{}{}
	for _, tag := range aclTags {
		tag = strings.TrimSpace(tag)
		if tag == "" || tag == EdgeTag {
			continue
		}
		wanted[tag] = struct{}{}
	}
	for _, ws := range workspaces {
		if _, ok := wanted[WorkspaceTagName(ws.Name)]; ok {
			workspaceIDs = append(workspaceIDs, ws.ID)
		}
	}
	for _, tag := range tags {
		if tag.ACLTag == EdgeTag {
			continue
		}
		if _, ok := wanted[tag.ACLTag]; ok {
			tagIDs = append(tagIDs, tag.ID)
		}
	}
	if workspaceIDs == nil {
		workspaceIDs = []string{}
	}
	if tagIDs == nil {
		tagIDs = []string{}
	}
	return workspaceIDs, tagIDs
}

type Named struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type TagOption struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	ACLTag string `json:"aclTag"`
}

type Tagged struct {
	ID     string
	ACLTag string
}

func MachineVisible(machineWorkspaceIDs []string, platformAdmin bool, viewerWorkspaces []string) bool {
	if platformAdmin {
		return true
	}
	if len(machineWorkspaceIDs) == 0 {
		return false
	}
	allowed := map[string]struct{}{}
	for _, id := range viewerWorkspaces {
		allowed[id] = struct{}{}
	}
	for _, id := range machineWorkspaceIDs {
		if _, ok := allowed[id]; ok {
			return true
		}
	}
	return false
}

func IsEdgeMachine(name, hostname string, tags []string) bool {
	norm := func(v string) string { return strings.ToLower(strings.TrimSpace(v)) }
	if norm(name) == "edge" || norm(hostname) == "edge" {
		return true
	}
	for _, tag := range tags {
		value := norm(tag)
		if value == EdgeTag || value == "edge" {
			return true
		}
	}
	return false
}
