package application

import "testing"

func TestReciprocalRankFusion_prefersSharedHits(t *testing.T) {
	listA := []SearchHit{
		{Type: "doc", Title: "A", Ref: "1", Score: 0.9},
		{Type: "code", Title: "B", Ref: "2", Score: 0.8},
	}
	listB := []SearchHit{
		{Type: "doc", Title: "A", Ref: "1", Score: 0.7},
		{Type: "doc", Title: "C", Ref: "3", Score: 0.6},
	}

	merged := ReciprocalRankFusion([][]SearchHit{listA, listB}, 60)
	if len(merged) != 3 {
		t.Fatalf("expected 3 hits, got %d", len(merged))
	}
	if merged[0].Title != "A" {
		t.Fatalf("expected doc A on top, got %s", merged[0].Title)
	}
}

func TestReciprocalRankFusion_normalizesScoresToUnitRange(t *testing.T) {
	listA := []SearchHit{{Type: "doc", Title: "A", Ref: "1", Score: 0.9}}
	listB := []SearchHit{{Type: "doc", Title: "A", Ref: "1", Score: 0.7}}

	merged := ReciprocalRankFusion([][]SearchHit{listA, listB}, 60)
	if len(merged) != 1 {
		t.Fatalf("expected 1 hit, got %d", len(merged))
	}
	if merged[0].Score < 0.99 || merged[0].Score > 1.01 {
		t.Fatalf("expected normalized score ~1.0 for consensus top hit, got %f", merged[0].Score)
	}
}

func TestReciprocalRankFusion_singleListNormalizedBelowOne(t *testing.T) {
	listA := []SearchHit{
		{Type: "doc", Title: "A", Ref: "1", Score: 0.9},
		{Type: "doc", Title: "B", Ref: "2", Score: 0.8},
	}

	merged := ReciprocalRankFusion([][]SearchHit{listA}, 60)
	if merged[0].Score < 0.99 || merged[0].Score > 1.01 {
		t.Fatalf("expected top hit normalized to ~1.0, got %f", merged[0].Score)
	}
	if merged[1].Score >= merged[0].Score {
		t.Fatalf("expected second hit score below top hit")
	}
}
