package httpapi

import (
	"testing"

	"otterscale/core/internal/headscale"
)

func TestMatchNodeByAddress(t *testing.T) {
	nodes := []headscale.Node{
		{ID: "1", Addresses: []string{"100.64.0.2", "fd7a::2"}},
		{ID: "2", Addresses: []string{"100.64.0.3"}},
	}
	got, err := matchNode(nodes, []string{" fd7a::2 "})
	if err != nil || got.ID != "1" {
		t.Fatalf("got %#v err %v", got, err)
	}
}

func TestMatchNodeWaitsUntilTheNodeExists(t *testing.T) {
	_, err := matchNode(nil, []string{"100.64.0.2"})
	if err != errNodePending {
		t.Fatalf("err %v", err)
	}
}

func TestMatchNodeRejectsTwoNodes(t *testing.T) {
	nodes := []headscale.Node{
		{ID: "1", Addresses: []string{"100.64.0.2"}},
		{ID: "2", Addresses: []string{"100.64.0.3"}},
	}
	_, err := matchNode(nodes, []string{"100.64.0.2", "100.64.0.3"})
	if err != errNodeAmbiguous {
		t.Fatalf("err %v", err)
	}
}
