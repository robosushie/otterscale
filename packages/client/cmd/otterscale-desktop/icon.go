package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"runtime"
)

// trayIcon is a lake-blue rounded mark.
// Windows loads an ICO. Linux and macOS load a PNG.
func trayIcon() []byte {
	img := mark()
	if runtime.GOOS == "windows" {
		return encodeICO(img)
	}
	return encodePNG(img)
}

func mark() *image.NRGBA {
	const size = 32
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	blue := color.NRGBA{R: 0x2b, G: 0x59, B: 0xd1, A: 0xff}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if inside(x, y, size, 6) {
				img.SetNRGBA(x, y, blue)
			}
		}
	}
	return img
}

func encodePNG(img *image.NRGBA) []byte {
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func inside(x, y, size, radius int) bool {
	if x < radius && y < radius {
		return (x-radius)*(x-radius)+(y-radius)*(y-radius) <= radius*radius
	}
	if x >= size-radius && y < radius {
		return (x-(size-radius))*(x-(size-radius))+(y-radius)*(y-radius) <= radius*radius
	}
	if x < radius && y >= size-radius {
		return (x-radius)*(x-radius)+(y-(size-radius))*(y-(size-radius)) <= radius*radius
	}
	if x >= size-radius && y >= size-radius {
		dx := x - (size - radius)
		dy := y - (size - radius)
		return dx*dx+dy*dy <= radius*radius
	}
	return true
}

func encodeICO(img *image.NRGBA) []byte {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	xor := make([]byte, w*h*4)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := img.NRGBAAt(b.Min.X+x, b.Min.Y+(h-1-y))
			i := (y*w + x) * 4
			xor[i] = c.B
			xor[i+1] = c.G
			xor[i+2] = c.R
			xor[i+3] = c.A
		}
	}
	andStride := ((w + 31) / 32) * 4
	and := make([]byte, andStride*h)
	dib := 40 + len(xor) + len(and)
	buf := &bytes.Buffer{}
	put := func(v any) { _ = binary.Write(buf, binary.LittleEndian, v) }
	put(uint16(0))
	put(uint16(1))
	put(uint16(1))
	put(uint8(w))
	put(uint8(h))
	put(uint8(0))
	put(uint8(0))
	put(uint16(1))
	put(uint16(32))
	put(uint32(dib))
	put(uint32(22))
	put(uint32(40))
	put(int32(w))
	put(int32(h * 2))
	put(uint16(1))
	put(uint16(32))
	put(uint32(0))
	put(uint32(len(xor) + len(and)))
	put(int32(0))
	put(int32(0))
	put(uint32(0))
	put(uint32(0))
	buf.Write(xor)
	buf.Write(and)
	return buf.Bytes()
}
