package grpcserver

import (
	"testing"

	"github.com/lingprism/core/internal/application"
)

func TestPingServer_shouldReturnPongWhenPingCalled(t *testing.T) {
	server := NewPingServer(application.NewPingService())

	resp, err := server.Ping(nil, &PingRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Message != "pong" {
		t.Fatalf("expected pong, got %q", resp.Message)
	}
}
