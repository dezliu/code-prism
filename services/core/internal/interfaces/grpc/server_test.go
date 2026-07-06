package grpcserver

import (
	"context"
	"testing"

	"github.com/lingprism/core/internal/application"
	"google.golang.org/protobuf/types/known/emptypb"
)

func TestCoreServiceServer_shouldReturnPongWhenPingCalled(t *testing.T) {
	server := &coreServiceServer{ping: application.NewPingService()}

	resp, err := server.Ping(context.Background(), &emptypb.Empty{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.GetValue() != "pong" {
		t.Fatalf("expected pong, got %q", resp.GetValue())
	}
}
