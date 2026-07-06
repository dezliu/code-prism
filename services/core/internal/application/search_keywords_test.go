package application

import "testing"

func TestExtractSearchKeywords_mixedEntity(t *testing.T) {
	keywords := extractSearchKeywords("git知识库设计是什么样的？")
	found := map[string]bool{}
	for _, kw := range keywords {
		found[kw] = true
	}
	if !found["git知识库"] && !found["git"] {
		t.Fatalf("expected git/git知识库 in keywords, got %v", keywords)
	}
}

func TestExtractSearchKeywords_englishIdentifier(t *testing.T) {
	keywords := extractSearchKeywords("nl-hermes 的具体设计")
	found := map[string]bool{}
	for _, kw := range keywords {
		found[kw] = true
	}
	if !found["nl-hermes"] {
		t.Fatalf("expected nl-hermes in keywords, got %v", keywords)
	}
}
