package main

import "testing"

func TestTrayIconFormats(t *testing.T) {
	ico := encodeICO(mark())
	if len(ico) < 22 || ico[2] != 1 || ico[4] != 1 {
		t.Fatalf("expected an ICO payload, len %d", len(ico))
	}
	pngBytes := encodePNG(mark())
	if len(pngBytes) < 8 || pngBytes[0] != 0x89 || pngBytes[1] != 'P' {
		t.Fatal("expected a PNG payload")
	}
}
