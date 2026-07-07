package application

import (
	"testing"

	idxclient "github.com/lingprism/core/internal/infrastructure/indexer"
)

func TestBuildSymbolIndexRecordsIncludesFilePathAndLines(t *testing.T) {
	class := "OrderService"
	doc := "reverts order"
	pkg := "order"
	out := idxclient.IndexerOutput{FilePath: "src/order/service.go"}
	out.Parse.Language = "go"
	out.Parse.PackageName = &pkg
	out.Parse.Symbols = []idxclient.Symbol{
		{
			Name: "Rollback", Kind: "function_declaration",
			StartLine: 10, EndLine: 20,
			ClassName: &class, DocComment: &doc,
			QualifiedName: "order.Rollback",
		},
	}

	repo := repoMeta{ID: "repo-1", Name: "payment-service", URL: "https://git.example/payment.git"}
	points, docs := buildSymbolIndexRecords([]idxclient.IndexerOutput{out}, repo, "/tmp/repo", 8)

	if len(points) != 1 {
		t.Fatalf("expected 1 point, got %d", len(points))
	}
	payload := points[0]["payload"].(map[string]interface{})
	if payload["filePath"] != "src/order/service.go" {
		t.Fatalf("unexpected filePath: %v", payload["filePath"])
	}
	if payload["startLine"] != 10 {
		t.Fatalf("unexpected startLine: %v", payload["startLine"])
	}
	if payload["repoName"] != "payment-service" {
		t.Fatalf("unexpected repoName: %v", payload["repoName"])
	}

	if len(docs) != 1 {
		t.Fatalf("expected 1 doc, got %d", len(docs))
	}
	if docs[0].MethodName != "Rollback" {
		t.Fatalf("expected method Rollback, got %s", docs[0].MethodName)
	}
	if docs[0].DocComment != doc {
		t.Fatalf("expected doc comment %q", doc)
	}
}

func TestRerankScoreExactQualifiedRef(t *testing.T) {
	loc := CodeLocation{QualifiedRef: "order.OrderService#Rollback", MethodName: "Rollback", ClassName: "OrderService"}
	score := rerankScore(loc, "order.OrderService#Rollback", "OrderService", "Rollback", 0.5)
	if score < 100 {
		t.Fatalf("expected high score for exact match, got %f", score)
	}
}
