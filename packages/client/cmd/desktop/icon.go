package main

import (
	"embed"
	"runtime"
)

// The tray and window marks are the console otter from public/favicon.ico
// and public/favicon-32.png.
//
//go:embed assets/favicon.ico assets/favicon-32.png
var iconFiles embed.FS

// trayIcon is the console otter. Windows loads the ICO. Linux and macOS load the PNG.
func trayIcon() []byte {
	name := "assets/favicon-32.png"
	if runtime.GOOS == "windows" {
		name = "assets/favicon.ico"
	}
	raw, err := iconFiles.ReadFile(name)
	if err != nil {
		return nil
	}
	return raw
}

func windowIcon() []byte {
	raw, err := iconFiles.ReadFile("assets/favicon-32.png")
	if err != nil {
		return nil
	}
	return raw
}
