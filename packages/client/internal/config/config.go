// Package config stores this computer's Otterscale client settings.
// The auth key used to join a machine is never written here.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const fileName = "config.json"
const deviceTokenFile = "device-token"

// File is the on-disk settings for this computer.
type File struct {
	BaseDomain  string `json:"baseDomain"`
	ConsoleURL  string `json:"consoleUrl"`
	APIURL      string `json:"apiUrl"`
	LoginServer string `json:"loginServer"`
	Hostname    string `json:"hostname"`
}

// Dir is the OS config directory for this user.
func Dir() (string, error) {
	switch runtime.GOOS {
	case "windows":
		base := os.Getenv("AppData")
		if base == "" {
			return "", errors.New("AppData is not set")
		}
		return filepath.Join(base, "Otterscale"), nil
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Application Support", "Otterscale"), nil
	default:
		base := os.Getenv("XDG_CONFIG_HOME")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			base = filepath.Join(home, ".config")
		}
		return filepath.Join(base, "otterscale"), nil
	}
}

// LoadFrom reads settings from dir. A missing file is an empty config.
func LoadFrom(dir string) (File, error) {
	raw, err := os.ReadFile(filepath.Join(dir, fileName))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return File{}, nil
		}
		return File{}, err
	}
	var file File
	if err := json.Unmarshal(raw, &file); err != nil {
		return File{}, fmt.Errorf("read config: %w", err)
	}
	file = file.trimmed()
	return file, nil
}

// Load reads settings from Dir.
func Load() (File, error) {
	dir, err := Dir()
	if err != nil {
		return File{}, err
	}
	return LoadFrom(dir)
}

// SaveTo writes settings to dir after validation.
func SaveTo(dir string, file File) error {
	file = file.trimmed()
	if err := file.Validate(); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	path := filepath.Join(dir, fileName)
	return os.WriteFile(path, raw, 0o600)
}

// SaveDeviceToken writes the device credential beside the config. It is not part of File.
func SaveDeviceToken(token string) error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, deviceTokenFile), []byte(strings.TrimSpace(token)), 0o600)
}

// LoadDeviceToken reads the device credential. A missing file is empty.
func LoadDeviceToken() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	raw, err := os.ReadFile(filepath.Join(dir, deviceTokenFile))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

// ClearDeviceToken removes the device credential.
func ClearDeviceToken() error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	err = os.Remove(filepath.Join(dir, deviceTokenFile))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// Save writes settings to Dir.
func Save(file File) error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	return SaveTo(dir, file)
}

// Apply sets one CLI key. A failed call leaves the file unchanged.
// The auth key is not a config key.
func Apply(file *File, key, value string) error {
	next := *file
	value = strings.TrimSpace(value)
	switch key {
	case "base-domain":
		next.BaseDomain = value
	case "console-url":
		next.ConsoleURL = value
	case "api-url":
		next.APIURL = value
	case "login-server":
		next.LoginServer = value
	case "hostname":
		next.Hostname = value
	default:
		return fmt.Errorf("unknown setting %q", key)
	}
	if err := next.Validate(); err != nil {
		return err
	}
	*file = next
	return nil
}

// Validate checks URLs and the hostname. Empty values are allowed.
func (f File) Validate() error {
	if err := baseDomain(f.BaseDomain); err != nil {
		return err
	}
	if err := httpURL(f.ConsoleURL, "console URL"); err != nil {
		return err
	}
	if err := httpURL(f.APIURL, "API URL"); err != nil {
		return err
	}
	if err := httpURL(f.LoginServer, "Headscale URL"); err != nil {
		return err
	}
	return hostname(f.Hostname)
}

func (f File) trimmed() File {
	f.BaseDomain = strings.TrimSpace(f.BaseDomain)
	f.ConsoleURL = strings.TrimSpace(f.ConsoleURL)
	f.APIURL = strings.TrimSpace(f.APIURL)
	f.LoginServer = strings.TrimSpace(f.LoginServer)
	f.Hostname = strings.TrimSpace(f.Hostname)
	return f
}

func baseDomain(raw string) error {
	if raw == "" {
		return nil
	}
	if strings.Contains(raw, "://") || strings.Contains(raw, "/") || strings.Contains(raw, " ") || strings.Contains(raw, ":") {
		return errors.New("base domain must be a hostname such as otterscale.example")
	}
	return nil
}

func httpURL(raw, label string) error {
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("%s must be an http or https URL", label)
	}
	return nil
}

func hostname(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > 63 {
		return errors.New("hostname must be 63 characters or fewer")
	}
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-':
		default:
			return errors.New("hostname may contain only letters, digits, and hyphens")
		}
	}
	return nil
}
