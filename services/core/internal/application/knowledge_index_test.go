package application

import "testing"

func TestChunkKnowledgeText(t *testing.T) {
	t.Parallel()

	chunks := chunkKnowledgeText("第一段内容。\n\n第二段内容。", 20)
	if len(chunks) == 0 {
		t.Fatalf("expected chunks")
	}

	longText := string(make([]byte, 1200))
	for i := range longText {
		longText = longText[:i] + "a" + longText[i+1:]
	}
	manyChunks := chunkKnowledgeText(longText, 400)
	if len(manyChunks) < 2 {
		t.Fatalf("expected long text to be split, got %d chunks", len(manyChunks))
	}
}

func TestBuildKnowledgeDocPoints(t *testing.T) {
	t.Parallel()

	points := buildKnowledgeDocPoints("doc-1", "标题", "repo-1", []string{"内容片段"}, 8, nil)
	if len(points) != 1 {
		t.Fatalf("expected 1 point, got %d", len(points))
	}
	payload, ok := points[0]["payload"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected payload map")
	}
	if payload["kind"] != "knowledge_doc" {
		t.Fatalf("expected knowledge_doc kind, got %v", payload["kind"])
	}
	if payload["docId"] != "doc-1" {
		t.Fatalf("expected docId doc-1, got %v", payload["docId"])
	}
}
