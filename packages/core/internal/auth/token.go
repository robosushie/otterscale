package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
)

// TokenHash is the stored form of a high-entropy secret such as an invite verifier.
func TokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// TokenEqual reports whether raw hashes to the stored hex digest.
// A malformed digest still runs a compare so the branch is not a cheap reject.
func TokenEqual(raw, storedHex string) bool {
	sum := sha256.Sum256([]byte(raw))
	stored, err := hex.DecodeString(storedHex)
	if err != nil || len(stored) != len(sum) {
		var zeros [sha256.Size]byte
		subtle.ConstantTimeCompare(sum[:], zeros[:])
		return false
	}
	return subtle.ConstantTimeCompare(sum[:], stored) == 1
}
