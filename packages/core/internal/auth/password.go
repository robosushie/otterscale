package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	PasswordMinLength = 8
	argonMemory       = 19456
	argonTime         = 2
	argonParallelism  = 1
	argonKeyLen       = 32
	argonSaltLen      = 16
)

func ValidatePassword(plain string) string {
	if len(plain) < PasswordMinLength {
		return fmt.Sprintf("Password must be at least %d characters.", PasswordMinLength)
	}
	return ""
}

// argonSlots caps concurrent memory-hard hashes for this process.
var argonSlots = make(chan struct{}, 4)

func enterArgon() func() {
	argonSlots <- struct{}{}
	return func() { <-argonSlots }
}

func HashPassword(plain string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	release := enterArgon()
	defer release()
	sum := argon2.IDKey([]byte(plain), salt, argonTime, argonMemory, argonParallelism, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonTime, argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(sum),
	), nil
}

func VerifyPassword(plain, encoded string) bool {
	mem, time, threads, salt, sum, err := parsePHC(encoded)
	if err != nil {
		return false
	}
	release := enterArgon()
	got := argon2.IDKey([]byte(plain), salt, time, mem, threads, uint32(len(sum)))
	release()
	return subtle.ConstantTimeCompare(got, sum) == 1
}

func parsePHC(encoded string) (mem, time uint32, threads uint8, salt, sum []byte, err error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return 0, 0, 0, nil, nil, fmt.Errorf("not argon2id")
	}
	var m, t int
	var p int
	for _, field := range strings.Split(parts[3], ",") {
		kv := strings.SplitN(field, "=", 2)
		if len(kv) != 2 {
			continue
		}
		n, convErr := strconv.Atoi(kv[1])
		if convErr != nil {
			return 0, 0, 0, nil, nil, convErr
		}
		switch kv[0] {
		case "m":
			m = n
		case "t":
			t = n
		case "p":
			p = n
		}
	}
	salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return 0, 0, 0, nil, nil, err
	}
	sum, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return 0, 0, 0, nil, nil, err
	}
	return uint32(m), uint32(t), uint8(p), salt, sum, nil
}
