//go:build windows

package service

import (
	"errors"
	"fmt"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"

	"otterscale/client/internal/engine"
)

const serviceName = "OtterscaleDaemon"

func requirePrivileged() error {
	if !windows.GetCurrentProcessToken().IsElevated() {
		return errors.New("run the Otterscale installer as administrator")
	}
	return nil
}

func register(binary string, start bool) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("run the Otterscale installer as administrator: %w", err)
	}
	defer m.Disconnect()
	removeService(m)
	startType := uint32(mgr.StartAutomatic)
	if !start {
		startType = mgr.StartManual
	}
	s, err := m.CreateService(serviceName, binary, mgr.Config{
		DisplayName:  "Otterscale",
		Description:  "Otterscale mesh daemon",
		StartType:    startType,
		ErrorControl: mgr.ErrorNormal,
	}, daemonArgs(engine.DaemonStateDir(), engine.ServiceSocket())...)
	if err != nil {
		return err
	}
	defer s.Close()
	if !start {
		return nil
	}
	return s.Start()
}

func unregister() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("run the Otterscale installer as administrator: %w", err)
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		if errors.Is(err, windows.ERROR_SERVICE_DOES_NOT_EXIST) {
			return nil
		}
		return err
	}
	defer s.Close()
	stopService(s)
	return s.Delete()
}

func removeService(m *mgr.Mgr) {
	s, err := m.OpenService(serviceName)
	if err != nil {
		return
	}
	defer s.Close()
	stopService(s)
	_ = s.Delete()
}

func startOfficial() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("run the Otterscale installer as administrator: %w", err)
	}
	defer m.Disconnect()
	s, err := m.OpenService("Tailscale")
	if err != nil {
		return err
	}
	defer s.Close()
	cfg, err := s.Config()
	if err == nil && cfg.StartType == mgr.StartDisabled {
		cfg.StartType = mgr.StartAutomatic
		if err := s.UpdateConfig(cfg); err != nil {
			return err
		}
	}
	st, err := s.Query()
	if err != nil || st.State != svc.Running {
		if err := s.Start(); err != nil && !errors.Is(err, windows.ERROR_SERVICE_ALREADY_RUNNING) {
			return err
		}
	}
	return waitOfficial()
}

func stopService(s *mgr.Service) {
	_, _ = s.Control(svc.Stop)
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		st, err := s.Query()
		if err != nil || st.State == svc.Stopped {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}
