package id

import (
	"crypto/rand"
	"encoding/hex"
)

func New() string {
	buf := make([]byte, 12)
	_, _ = rand.Read(buf)
	return "c" + hex.EncodeToString(buf)
}
