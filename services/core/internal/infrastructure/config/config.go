package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/lingprism/core/internal/infrastructure/qdrant"
)

type Config struct {
	LogLevel        string
	HTTPPort        int
	GRPCPort        int
	MySQLDSN        string
	Neo4jURI        string
	Neo4jUser       string
	Neo4jPassword   string
	QdrantURL       string
	QdrantCollection string
	EmbeddingDim    int
	OpenSearchURL   string
	RedisURL        string
	IndexerGRPCAddr string
}

func Load() (*Config, error) {
	loadProjectEnv()

	httpPort, err := resolveHTTPPort()
	if err != nil {
		return nil, err
	}

	grpcPort, err := strconv.Atoi(getEnv("CORE_GRPC_PORT", "50051"))
	if err != nil {
		return nil, fmt.Errorf("invalid CORE_GRPC_PORT: %w", err)
	}

	embeddingDim, err := strconv.Atoi(getEnv("ZHIPU_EMBEDDING_DIM", "1024"))
	if err != nil {
		return nil, fmt.Errorf("invalid ZHIPU_EMBEDDING_DIM: %w", err)
	}

	embeddingProvider := getEnv("EMBEDDING_PROVIDER", qdrant.DefaultProvider)

	return &Config{
		LogLevel:         getEnv("LOG_LEVEL", "info"),
		HTTPPort:         httpPort,
		GRPCPort:         grpcPort,
		MySQLDSN:         resolveMySQLDSN(),
		Neo4jURI:         getEnv("NEO4J_URI", "bolt://localhost:7687"),
		Neo4jUser:        getEnv("NEO4J_USER", "neo4j"),
		Neo4jPassword:    getEnv("NEO4J_PASSWORD", "lingprism"),
		QdrantURL:        resolveQdrantURL(),
		QdrantCollection: resolveQdrantCollection(embeddingProvider, embeddingDim),
		EmbeddingDim:     embeddingDim,
		OpenSearchURL:    resolveOpenSearchURL(),
		RedisURL:         resolveRedisURL(),
		IndexerGRPCAddr:  getEnv("INDEXER_GRPC_ADDR", "localhost:50052"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func resolveQdrantCollection(embeddingProvider string, embeddingDim int) string {
	if explicit := os.Getenv("QDRANT_COLLECTION"); explicit != "" {
		return explicit
	}
	return qdrant.ResolveCollectionName(embeddingProvider, embeddingDim)
}
