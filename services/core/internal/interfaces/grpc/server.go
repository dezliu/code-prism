package grpcserver

import (
	"context"
	"fmt"
	"net"

	"github.com/lingprism/core/internal/application"
	"google.golang.org/grpc"
)

// PingServer gRPC Ping 服务占位 — proto 生成后替换为 codegen 实现（Batch 2+）
type PingServer struct {
	ping *application.PingService
}

func NewPingServer(ping *application.PingService) *PingServer {
	return &PingServer{ping: ping}
}

// Ping 实现 CoreService.Ping RPC（手动 stub，待 protoc 生成后对齐）
func (s *PingServer) Ping(_ context.Context, _ *PingRequest) (*PingResponse, error) {
	return &PingResponse{Message: s.ping.Ping()}, nil
}

// PingRequest / PingResponse 与 api/proto/core/v1/core.proto 对齐的手写占位
type PingRequest struct{}

type PingResponse struct {
	Message string `json:"message"`
}

// Register 注册 gRPC 服务占位 — 使用 unary interceptor 模拟 Ping
func Register(server *grpc.Server, ping *application.PingService) {
	_ = NewPingServer(ping)
	// Batch 1: 无 codegen，通过 grpc reflection 或 HTTP /health 验收；
	// gRPC listener 启动并监听端口，真实 RPC 在 protoc 生成后启用。
	_ = server
}

func Start(port int, ping *application.PingService) (*grpc.Server, error) {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, fmt.Errorf("listen grpc: %w", err)
	}

	srv := grpc.NewServer()
	Register(srv, ping)

	go func() {
		if err := srv.Serve(lis); err != nil {
			fmt.Printf(`{"level":"error","msg":"grpc serve failed","error":%q}`+"\n", err.Error())
		}
	}()

	return srv, nil
}
