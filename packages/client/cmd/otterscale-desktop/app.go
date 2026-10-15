package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"otterscale/client/internal/config"
	"otterscale/client/internal/engine"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the desktop window's bridge to the local engine.
type App struct {
	ctx       context.Context
	quit      atomic.Bool
	engine    *engine.Engine
	trayStart func()
	trayEnd   func()
	status    atomic.Pointer[systray.MenuItem]
	stopped   chan struct{}
	stopOnce  sync.Once
}

func NewApp() *App {
	return &App{engine: engine.New(), stopped: make(chan struct{})}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if a.trayStart != nil {
		a.trayStart()
	}
	go func() {
		ensure, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = a.engine.Ensure(ensure)
		a.refreshTray()
	}()
	go a.watchTray()
}

func (a *App) shutdown(context.Context) {
	a.stopOnce.Do(func() { close(a.stopped) })
	if a.trayEnd != nil {
		a.trayEnd()
	}
}

func (a *App) beforeClose(ctx context.Context) bool {
	if a.quit.Load() {
		return false
	}
	runtime.WindowHide(ctx)
	return true
}

func (a *App) onTrayReady() {
	systray.SetIcon(trayIcon())
	systray.SetTooltip("Otterscale")
	systray.SetOnClick(func(systray.IMenu) { a.show() })
	status := systray.AddMenuItem("Not running", "This machine")
	status.Disable()
	a.status.Store(status)
	open := systray.AddMenuItem("Open", "Show Otterscale")
	open.Click(a.show)
	disconnect := systray.AddMenuItem("Disconnect", "Stop this machine")
	disconnect.Click(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		_ = a.engine.Down(ctx)
		a.refreshTray()
	})
	systray.AddSeparator()
	quit := systray.AddMenuItem("Quit", "Quit Otterscale")
	quit.Click(func() {
		a.quit.Store(true)
		if a.ctx != nil {
			runtime.Quit(a.ctx)
		}
	})
	a.refreshTray()
}

func (a *App) watchTray() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.stopped:
			return
		case <-ticker.C:
			a.refreshTray()
		}
	}
}

func (a *App) refreshTray() {
	item := a.status.Load()
	if item == nil {
		return
	}
	st, err := a.engine.Status(context.Background())
	label := "Not running"
	if err == nil {
		label = trayLabel(st)
	}
	item.SetTitle(label)
	systray.SetTooltip("Otterscale — " + label)
}

func trayLabel(st engine.Status) string {
	if !st.DaemonRunning {
		return "Not running"
	}
	switch st.BackendState {
	case "Running":
		return "Connected"
	case "":
		return "Starting"
	default:
		return st.BackendState
	}
}

func (a *App) show() {
	if a.ctx == nil {
		return
	}
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
}

// GetConfig returns this computer's saved URLs and hostname.
func (a *App) GetConfig() (config.File, error) {
	return config.Load()
}

// SaveConfig stores local settings. It does not accept an auth key.
func (a *App) SaveConfig(file config.File) error {
	return config.Save(file)
}

// GetStatus reports whether this machine is on the mesh.
func (a *App) GetStatus() engine.Status {
	st, err := a.engine.Status(context.Background())
	if err != nil && st.Message == "" {
		st.Message = err.Error()
	}
	if st.Addresses == nil {
		st.Addresses = []string{}
	}
	return st
}

// Connect registers this machine when authKey is set, or reconnects when it is empty.
func (a *App) Connect(authKey, loginServer, hostname string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	err := a.engine.Up(ctx, engine.UpOptions{
		AuthKey:     authKey,
		LoginServer: loginServer,
		Hostname:    hostname,
	})
	a.refreshTray()
	return err
}

// Disconnect stops traffic for this machine.
func (a *App) Disconnect() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	err := a.engine.Down(ctx)
	a.refreshTray()
	return err
}

// OpenConsole opens the saved console URL in the browser.
func (a *App) OpenConsole() error {
	file, err := config.Load()
	if err != nil {
		return err
	}
	if file.ConsoleURL == "" {
		return errors.New("set a console URL in Settings")
	}
	if a.ctx == nil {
		return errors.New("window is not ready")
	}
	runtime.BrowserOpenURL(a.ctx, file.ConsoleURL)
	return nil
}
