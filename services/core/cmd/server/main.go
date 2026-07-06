package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lingprism/core/internal/application"
	"github.com/lingprism/core/internal/infrastructure/config"
	httpiface "github.com/lingprism/core/internal/interfaces/http"
	grpciface "github.com/lingprism/core/internal/interfaces/grpc"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	healthSvc := application.NewHealthService()
	pingSvc := application.NewPingService()

	grpcServer, err := grpciface.Start(cfg.GRPCPort, pingSvc)
	if err != nil {
		log.Fatalf("start grpc: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/health", httpiface.NewHealthHandler(healthSvc))

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf(`{"level":"%s","msg":"core http server started","port":%d}`, cfg.LogLevel, cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http serve: %v", err)
		}
	}()

	log.Printf(`{"level":"%s","msg":"core grpc server started","port":%d}`, cfg.LogLevel, cfg.GRPCPort)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	grpcServer.GracefulStop()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("http shutdown error: %v", err)
	}
}
