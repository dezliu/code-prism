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
	gitclient "github.com/lingprism/core/internal/infrastructure/git"
	"github.com/lingprism/core/internal/infrastructure/embedding"
	idxclient "github.com/lingprism/core/internal/infrastructure/indexer"
	neo4jstore "github.com/lingprism/core/internal/infrastructure/neo4j"
	opensearchstore "github.com/lingprism/core/internal/infrastructure/opensearch"
	"github.com/lingprism/core/internal/infrastructure/mysql"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
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

	db, err := mysql.NewClient(cfg.MySQLDSN)
	if err != nil {
		log.Printf(`{"level":"warn","msg":"mysql unavailable, internal api degraded","error":%q}`, err.Error())
	}
	defer func() {
		if db != nil {
			_ = db.Close()
		}
	}()

	gitClient := gitclient.NewClient(cfg.GitWorkDir)
	indexerClient := idxclient.NewClient(cfg.IndexerBinary)
	log.Printf(`{"level":"info","msg":"embedding config","dim":%d,"collection":%q}`, cfg.EmbeddingDim, cfg.QdrantCollection)
	qdrantStore := qdrantclient.NewClient(cfg.QdrantURL, cfg.QdrantCollection, cfg.EmbeddingDim)
	embedder := embedding.NewClient(cfg.EmbeddingDim)
	openSearch := opensearchstore.NewClient(cfg.OpenSearchURL)
	if openSearch.Enabled() {
		if err := openSearch.EnsureIndex(context.Background()); err != nil {
			log.Printf(`{"level":"warn","msg":"opensearch index setup failed","error":%q}`, err.Error())
		}
	}

	var neo4jClient *neo4jstore.Client
	if cfg.Neo4jURI != "" {
		neo4jClient, err = neo4jstore.NewClient(cfg.Neo4jURI, cfg.Neo4jUser, cfg.Neo4jPassword)
		if err != nil {
			log.Printf(`{"level":"warn","msg":"neo4j unavailable","error":%q}`, err.Error())
		}
	}

	var indexSvc *application.IndexService
	var searchSvc *application.SearchService
	var archSvc *application.ArchitectureService
	var graphSvc *application.GraphQueryService
	var symbolResolveSvc *application.SymbolResolveService
	var repoSyncSvc *application.RepoSyncService
	if db != nil {
		indexSvc = application.NewIndexService(db, application.IndexServiceDeps{
			Git: gitClient, Indexer: indexerClient, Neo4j: neo4jClient,
			Qdrant: qdrantStore, OpenSearch: openSearch, QdrantDim: cfg.EmbeddingDim,
		})
		searchSvc = application.NewSearchService(db, qdrantStore, cfg.EmbeddingDim, embedder, openSearch, neo4jClient)
		graphSvc = application.NewGraphQueryService(neo4jClient)
		symbolResolveSvc = application.NewSymbolResolveService(qdrantStore, cfg.EmbeddingDim, embedder, openSearch, gitClient)
		archSvc = application.NewArchitectureService(db)
		repoSyncSvc = application.NewRepoSyncService(db, gitClient)
	}

	grpcServer, err := grpciface.Start(cfg.GRPCPort, pingSvc)
	if err != nil {
		log.Fatalf("start grpc: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/health", httpiface.NewHealthHandler(healthSvc))
	if indexSvc != nil && searchSvc != nil && archSvc != nil {
		internalHandler := httpiface.NewHandler(indexSvc, searchSvc, archSvc, graphSvc, symbolResolveSvc)
		internalHandler.Register(mux)
	}

	syncCtx, syncCancel := context.WithCancel(context.Background())
	defer syncCancel()
	application.StartRepoSyncWorker(syncCtx, repoSyncSvc, cfg.RepoSyncInterval)

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

	if neo4jClient != nil {
		_ = neo4jClient.Close(ctx)
	}
	grpcServer.GracefulStop()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("http shutdown error: %v", err)
	}
}
