package application

import "github.com/lingprism/core/internal/domain"

// HealthService 应用层健康检查占位
type HealthService struct{}

func NewHealthService() *HealthService {
	return &HealthService{}
}

func (s *HealthService) Status() map[string]string {
	return map[string]string{
		"status":  "ok",
		"service": "core",
	}
}

// PingService gRPC Ping 占位
type PingService struct{}

func NewPingService() *PingService {
	return &PingService{}
}

func (s *PingService) Ping() string {
	return "pong"
}

// ListRepositories 占位 — 返回空列表
func (s *HealthService) ListRepositories() []domain.Repository {
	return []domain.Repository{}
}
