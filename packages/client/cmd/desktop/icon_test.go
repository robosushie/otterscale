package main

import "testing"

func TestTrayIconFormats(t *testing.T) {
	ico, err := iconFiles.ReadFile("assets/favicon.ico")
	if err != nil {
		t.Fatal(err)
	}
	if len(ico) < 22 || ico[2] != 1 || ico[4] == 0 {
		t.Fatalf("expected an ICO payload, len %d", len(ico))
	}
	pngBytes, err := iconFiles.ReadFile("assets/favicon-32.png")
	if err != nil {
		t.Fatal(err)
	}
	if len(pngBytes) < 8 || pngBytes[0] != 0x89 || pngBytes[1] != 'P' {
		t.Fatal("expected a PNG payload")
	}
	if len(trayIcon()) == 0 || len(windowIcon()) == 0 {
		t.Fatal("expected icon bytes")
	}
}
