package auth

import "testing"

func TestValidatePassword(t *testing.T) {
	if ValidatePassword("short") == "" {
		t.Fatal("expected rejection")
	}
	if ValidatePassword("long-enough") != "" {
		t.Fatal("expected acceptance")
	}
}

func TestArgon2idRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("correct horse", hash) {
		t.Fatal("expected match")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatal("expected mismatch")
	}
	known := "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$A" // truncated, must fail closed
	if VerifyPassword("x", known) {
		t.Fatal("malformed phc should not verify")
	}
}
