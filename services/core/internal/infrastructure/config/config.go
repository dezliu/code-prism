package config

import (
	"fmt"
	"os"
	"strconv"
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
	httpPort, err := strconv.Atoi(getEnv("CORE_HTTP_PORT", "8080"))
	if err != nil {
		return nil, fmt.Errorf("invalid CORE_HTTP_PORT: %w", err)
	}

	grpcPort, err := strconv.Atoi(getEnv("CORE_GRPC_PORT", "50051"))
	if err != nil {
		return nil, fmt.Errorf("invalid CORE_GRPC_PORT: %w", err)
	}

	embeddingDim, err := strconv.Atoi(getEnv("ZHIPU_EMBEDDING_DIM", "1024"))
	if err != nil {
		return nil, fmt.Errorf("invalid ZHIPU_EMBEDDING_DIM: %w", err)
	}

	return &Config{
		LogLevel:         getEnv("LOG_LEVEL", "info"),
		HTTPPort:         httpPort,
		GRPCPort:         grpcPort,
		MySQLDSN:         getEnv("MYSQL_DSN", "lingprism:lingprism@tcp(localhost:3306)/lingprism?parseTime=true"),
		Neo4jURI:         getEnv("NEO4J_URI", "bolt://localhost:7687"),
		Neo4jUser:        getEnv("NEO4J_USER", "neo4j"),
		Neo4jPassword:    getEnv("NEO4J_PASSWORD", "lingprism"),
		QdrantURL:        getEnv("QDRANT_URL", "http://localhost:6333"),
		QdrantCollection: getEnv("QDRANT_COLLECTION", "lingprism_v1_zhipu_1024"),
		EmbeddingDim:     embeddingDim,
		OpenSearchURL:    getEnv("OPENSEARCH_URL", "http://localhost:9200"),
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379/0"),
		IndexerGRPCAddr:  getEnv("INDEXER_GRPC_ADDR", "localhost:50052"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
