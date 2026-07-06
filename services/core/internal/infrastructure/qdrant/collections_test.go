package qdrant

import "testing"

func TestResolveCollectionName_shouldBuildDefaultZhipuCollection(t *testing.T) {
	name := ResolveCollectionName("zhipu", 1024)
	if name != "lingprism_v1_zhipu_1024" {
		t.Fatalf("unexpected collection name: %s", name)
	}
}

func TestResolveCollectionName_shouldUseFallbacksForEmptyProviderOrDim(t *testing.T) {
	name := ResolveCollectionName("", 0)
	if name != "lingprism_v1_zhipu_1024" {
		t.Fatalf("unexpected fallback collection name: %s", name)
	}
}

func TestResolveCollectionName_shouldSupportOtherProviders(t *testing.T) {
	cases := []struct {
		provider string
		dim      int
		want     string
	}{
		{"deepseek", 1536, "lingprism_v1_deepseek_1536"},
		{"qwen", 1024, "lingprism_v1_qwen_1024"},
		{"openai", 1536, "lingprism_v1_openai_1536"},
	}

	for _, tc := range cases {
		got := ResolveCollectionName(tc.provider, tc.dim)
		if got != tc.want {
			t.Fatalf("provider=%s dim=%d: got %s want %s", tc.provider, tc.dim, got, tc.want)
		}
	}
}
