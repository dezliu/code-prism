package application

import (
	"testing"
)

func TestIndexService_TestConnection_InvalidURL(t *testing.T) {
	svc := &IndexService{}
	result := svc.TestConnection(nil, TestConnectionInput{URL: "not-a-url"})
	if result.OK {
		t.Fatal("expected connection failure for invalid url")
	}
}

func TestIndexService_TestConnection_ValidURL(t *testing.T) {
	svc := &IndexService{}
	result := svc.TestConnection(nil, TestConnectionInput{
		URL:           "https://github.com/org/payment-service.git",
		AuthType:      "https",
		DefaultBranch: "main",
	})
	if !result.OK {
		t.Fatalf("expected ok, got error: %s", result.Error)
	}
	if len(result.LanguageSummary) == 0 {
		t.Fatal("expected language summary")
	}
}

func TestDefaultGraphData_HasNodes(t *testing.T) {
	graph := defaultGraphData("repo-1")
	nodes, ok := graph["nodes"].([]map[string]interface{})
	if !ok || len(nodes) == 0 {
		t.Fatal("expected graph nodes")
	}
}
