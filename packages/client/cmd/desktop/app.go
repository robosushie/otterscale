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
	linking   atomic.Bool
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

// Network lists the linking person's workspaces, machines, and running apps.
func (a *App) Network() (discover.Network, error) {
	token, err := config.LoadDeviceToken()
	if err != nil {
		return discover.Network{}, err
	}
	file, err := config.Load()
	if err != nil {
		return discover.Network{}, err
	}
	if token == "" || file.APIURL == "" {
		return discover.Network{}, errors.New("this computer is not enrolled")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return discover.FetchNetwork(ctx, file.APIURL, token)
}

func (a *App) deviceAPI() (string, string, error) {
	token, err := config.LoadDeviceToken()
	if err != nil {
		return "", "", err
	}
	file, err := config.Load()
	if err != nil {
		return "", "", err
	}
	if token == "" || file.APIURL == "" {
		return "", "", errors.New("this computer is not enrolled")
	}
	return file.APIURL, token, nil
}

// CreateMachineKey mints a one-time key for workspaces this user belongs to.
func (a *App) CreateMachineKey(workspaceIDs []string) (discover.MachineKey, error) {
	apiURL, token, err := a.deviceAPI()
	if err != nil {
		return discover.MachineKey{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return discover.CreateMachineKey(ctx, apiURL, token, workspaceIDs)
}

// UpdateMachine renames a machine this user added and sets its workspaces.
func (a *App) UpdateMachine(id, name string, workspaceIDs []string) error {
	apiURL, token, err := a.deviceAPI()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return discover.UpdateMachine(ctx, apiURL, token, id, name, workspaceIDs)
}

// DeleteMachine removes a machine this user added. This computer is signed out when it is the deleted row.
func (a *App) DeleteMachine(id string, thisComputer bool) error {
	apiURL, token, err := a.deviceAPI()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := discover.DeleteOwnedMachine(ctx, apiURL, token, id); err != nil {
		return err
	}
	if !thisComputer {
		return nil
	}
	_ = config.ClearDeviceToken()
	return a.engine.Logout(ctx)
}

// SaveApp creates or updates an app on a machine this user added.
func (a *App) SaveApp(id, machineID, subdomain string, port int) error {
	apiURL, token, err := a.deviceAPI()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return discover.SaveApp(ctx, apiURL, token, id, machineID, subdomain, port)
}

// DeleteApp removes an app this user published.
func (a *App) DeleteApp(id string) error {
	apiURL, token, err := a.deviceAPI()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return discover.DeleteOwnedApp(ctx, apiURL, token, id)
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
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "connect-progress", "Joining the network…")
	}
	a.linking.Store(true)
	defer a.linking.Store(false)
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
	if a.linking.Load() {
		return
	}
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
	// The console no longer has this computer. Drop the token only.
	// Logout is Disconnect; signing the daemon out here also kills a Tailscale session.
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
