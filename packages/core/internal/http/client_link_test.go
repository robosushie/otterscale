package httpapi

import (
	"strings"
	"testing"
	"time"
)

func TestDeviceLinkHandsOutTheKeyOnce(t *testing.T) {
	book := newLinkBook()
	now := time.Now()
	code, _ := book.create(now)
	status, key, enrollment := book.poll(code, now)
	if status != "pending" || key != "" || enrollment != "" {
		t.Fatalf("pending status=%s key=%q enrollment=%q", status, key, enrollment)
	}
	if err := book.approve(code, "tskey-auth-once", "user-1", now); err != nil {
		t.Fatal(err)
	}
	status, key, enrollment = book.poll(code, now)
	if status != "approved" || key != "tskey-auth-once" || enrollment == "" {
		t.Fatalf("approved status=%s key=%q enrollment=%q", status, key, enrollment)
	}
	owner, err := book.enrollmentOwner(enrollment, now)
	if err != nil {
		t.Fatal(err)
	}
	if owner != "user-1" {
		t.Fatalf("owner %q", owner)
	}
	if err := book.consumeEnrollment(enrollment, now); err != nil {
		t.Fatal(err)
	}
	if err := book.consumeEnrollment(enrollment, now); err == nil {
		t.Fatal("enrollment must be single use")
	}
	status, key, enrollment = book.poll(code, now)
	if status != "approved" || key != "" || enrollment != "" {
		t.Fatalf("second read status=%s key=%q enrollment=%q", status, key, enrollment)
	}
}

func TestDeviceLinkExpires(t *testing.T) {
	book := newLinkBook()
	now := time.Now()
	code, _ := book.create(now)
	status, _, _ := book.poll(code, now.Add(linkTTL+time.Second))
	if status != "expired" {
		t.Fatalf("status %s", status)
	}
	if err := book.approve(code, "tskey", "user-1", now.Add(linkTTL+time.Second)); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("approve err %v", err)
	}
}
