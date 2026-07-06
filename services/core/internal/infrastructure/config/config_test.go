package config

import (
	"os"
	"testing"
)

func TestLoad_shouldUseDefaultsWhenEnvNotSet(t *testing.T) {
	t.Setenv("CORE_HTTP_PORT", "")
	t.Setenv("CORE_GRPC_PORT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.HTTPPort != 8080 {
		t.Fatalf("expected http port 8080, got %d", cfg.HTTPPort)
	}
	if cfg.GRPCPort != 50051 {
		t.Fatalf("expected grpc port 50051, got %d", cfg.GRPCPort)
	}
	if cfg.QdrantCollection != "lingprism_v1_zhipu_1024" {
		t.Fatalf("unexpected qdrant collection: %s", cfg.QdrantCollection)
	}
}

func TestLoad_shouldDeriveQdrantCollectionFromEmbeddingProvider(t *testing.T) {
	t.Setenv("QDRANT_COLLECTION", "")
	t.Setenv("EMBEDDING_PROVIDER", "qwen")
	t.Setenv("ZHIPU_EMBEDDING_DIM", "768")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.QdrantCollection != "lingprism_v1_qwen_768" {
		t.Fatalf("unexpected derived collection: %s", cfg.QdrantCollection)
	}

	os.Unsetenv("EMBEDDING_PROVIDER")
	os.Unsetenv("ZHIPU_EMBEDDING_DIM")
}

func TestLoad_shouldReadCustomPortsFromEnv(t *testing.T) {
	t.Setenv("CORE_HTTP_PORT", "9090")
	t.Setenv("CORE_GRPC_PORT", "9091")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.HTTPPort != 9090 {
		t.Fatalf("expected http port 9090, got %d", cfg.HTTPPort)
	}
	if cfg.GRPCPort != 9091 {
		t.Fatalf("expected grpc port 9091, got %d", cfg.GRPCPort)
	}

	// cleanup for other tests in same package
	os.Unsetenv("CORE_HTTP_PORT")
	os.Unsetenv("CORE_GRPC_PORT")
}
