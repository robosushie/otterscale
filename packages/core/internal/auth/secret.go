package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

func EncryptSecret(plaintext, authSecret string) (string, error) {
	key := sha256.Sum256([]byte(authSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	tagSize := gcm.Overhead()
	ciphertext := sealed[:len(sealed)-tagSize]
	tag := sealed[len(sealed)-tagSize:]
	out := append(append(nonce, tag...), ciphertext...)
	return base64.RawURLEncoding.EncodeToString(out), nil
}

func DecryptSecret(payload, authSecret string) (string, error) {
	buf, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", err
	}
	if len(buf) < 12+16 {
		return "", fmt.Errorf("secret payload is too short")
	}
	key := sha256.Sum256([]byte(authSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := buf[:12]
	tag := buf[12:28]
	data := buf[28:]
	plain, err := gcm.Open(nil, nonce, append(data, tag...), nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
