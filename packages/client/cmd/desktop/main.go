package main

import (
	"embed"
	"fmt"
	"os"

	"otterscale/client/internal/service"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if code, handled := serviceCommand(os.Args[1:]); handled {
		os.Exit(code)
	}
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
		Linux:            &linux.Options{Icon: windowIcon()},
		Mac:              &mac.Options{About: &mac.AboutInfo{Title: "Otterscale", Icon: windowIcon()}},
	})
	if err != nil {
		println("Otterscale:", err.Error())
	}
}

// serviceCommand handles installer flags before the window opens.
func serviceCommand(args []string) (int, bool) {
	if len(args) == 0 {
		return 0, false
	}
	var err error
	switch args[0] {
	case "--install-service":
		err = service.Install()
	case "--uninstall-service":
		err = service.Uninstall()
	default:
		return 0, false
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1, true
	}
	return 0, true
}
