package main

import (
	"embed"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	start, end := systray.RunWithExternalLoop(app.onTrayReady, nil)
	app.trayStart = start
	app.trayEnd = end

	err := wails.Run(&options.App{
		Title:            "Otterscale",
		Width:            880,
		Height:           640,
		MinWidth:         720,
		MinHeight:        560,
		BackgroundColour: &options.RGBA{R: 246, G: 243, B: 241, A: 255},
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose:    app.beforeClose,
		Bind:             []any{app},
	})
	if err != nil {
		println("Otterscale:", err.Error())
	}
}
