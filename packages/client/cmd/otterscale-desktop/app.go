package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"otterscale/client/internal/config"
	"otterscale/client/internal/discover"
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
		a.checkDevice()
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
	disconnect := systray.AddMenuItem("Disconnect", "Remove this machine")
	disconnect.Click(func() {
		_ = a.Disconnect()
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
			a.checkDevice()
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

// Disconnect removes this computer from the console, then signs the daemon out.
func (a *App) Disconnect() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := a.removeFromConsole(ctx); err != nil {
		a.refreshTray()
		return err
	}
	err := a.engine.Logout(ctx)
	a.refreshTray()
	return err
}

func (a *App) removeFromConsole(ctx context.Context) error {
	token, err := config.LoadDeviceToken()
	if err != nil {
		return err
	}
	file, err := config.Load()
	if err != nil {
		return err
	}
	if token == "" || file.APIURL == "" {
		return errors.New("this computer is not enrolled")
	}
	err = discover.DeleteDevice(ctx, file.APIURL, token)
	if err != nil && !errors.Is(err, discover.ErrDeviceGone) {
		return err
	}
	return config.ClearDeviceToken()
}

// ConnectConsole loads addresses from api.<domain>, opens the console to approve
// this computer, and joins the network with the one-time key. The key is not saved.
func (a *App) ConnectConsole(baseDomain string) error {
	domain, err := discover.NormalizeDomain(baseDomain)
	if err != nil {
		return err
	}
	fetchCtx, fetchCancel := context.WithTimeout(context.Background(), 20*time.Second)
	apiBase := discover.APIBase(domain)
	ends, err := discover.FetchBootstrap(fetchCtx, apiBase)
	if err != nil {
		fetchCancel()
		return err
	}
	file, err := config.Load()
	if err != nil {
		fetchCancel()
		return err
	}
	file.BaseDomain = domain
	file.ConsoleURL = ends.ConsoleURL
	file.APIURL = ends.APIURL
	file.LoginServer = ends.LoginServer
	if err := config.Save(file); err != nil {
		fetchCancel()
		return err
	}
	link, err := discover.StartLink(fetchCtx, ends.APIURL)
	fetchCancel()
	if a.ctx == nil {
		return errors.New("window is not ready")
	}
	if err != nil {
		runtime.BrowserOpenURL(a.ctx, ends.ConsoleURL)
		return err
	}
	runtime.BrowserOpenURL(a.ctx, link.ApproveURL)
	pollCtx, pollCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	approval, err := discover.WaitForKey(pollCtx, ends.APIURL, link.Code)
	pollCancel()
	if err != nil {
		return err
	}
	upCtx, upCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	err = a.engine.Up(upCtx, engine.UpOptions{
		AuthKey:     approval.Key,
		LoginServer: ends.LoginServer,
		Hostname:    file.Hostname,
	})
	upCancel()
	if err != nil {
		a.refreshTray()
		return err
	}
	enrollCtx, enrollCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer enrollCancel()
	token, err := enrollDevice(enrollCtx, a.engine, ends.APIURL, approval.Enrollment)
	if err != nil {
		a.refreshTray()
		return err
	}
	if err := config.SaveDeviceToken(token); err != nil {
		return err
	}
	a.refreshTray()
	return nil
}

func enrollDevice(ctx context.Context, eng *engine.Engine, apiURL, enrollment string) (string, error) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	var last error
	for {
		attempt, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		st, _ := eng.Status(attempt)
		token, err := discover.Enroll(attempt, apiURL, enrollment, st.Addresses)
		cancel()
		if err == nil {
			return token, nil
		}
		if discover.Retryable(err) {
			last = err
		} else if errors.Is(err, context.DeadlineExceeded) {
			if last == nil {
				last = err
			}
		} else {
			return "", err
		}
		select {
		case <-ctx.Done():
			if last != nil {
				return "", last
			}
			return "", ctx.Err()
		case <-ticker.C:
		}
	}
}

func (a *App) checkDevice() {
	token, err := config.LoadDeviceToken()
	if err != nil || token == "" {
		return
	}
	file, err := config.Load()
	if err != nil || file.APIURL == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err = discover.CheckDevice(ctx, file.APIURL, token)
	if err == nil || !errors.Is(err, discover.ErrDeviceGone) {
		return
	}
	logout, logoutCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer logoutCancel()
	if err := a.engine.Logout(logout); err != nil {
		return
	}
	_ = config.ClearDeviceToken()
}

// OpenConsole opens the saved console URL in the browser.
func (a *App) OpenConsole() error {
	file, err := config.Load()
	if err != nil {
		return err
	}
	if file.ConsoleURL == "" {
		return errors.New("connect to the console in General first")
	}
	if a.ctx == nil {
		return errors.New("window is not ready")
	}
	runtime.BrowserOpenURL(a.ctx, file.ConsoleURL)
	return nil
}
