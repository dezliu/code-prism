package application

import (
	"testing"
)

func TestPingService_shouldReturnPong(t *testing.T) {
	svc := NewPingService()
	if got := svc.Ping(); got != "pong" {
		t.Fatalf("expected pong, got %q", got)
	}
}

func TestHealthService_shouldReturnOkStatus(t *testing.T) {
	svc := NewHealthService()
	status := svc.Status()

	if status["status"] != "ok" {
		t.Fatalf("expected ok, got %q", status["status"])
	}
	if status["service"] != "core" {
		t.Fatalf("expected core, got %q", status["service"])
	}
}
