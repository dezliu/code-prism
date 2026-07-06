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
