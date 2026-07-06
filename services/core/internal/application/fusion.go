package application

import "sort"

type RankedHit struct {
	Key   string
	Hit   SearchHit
	Score float64
}

// ReciprocalRankFusion merges ranked lists with RRF (k=60 by default).
func ReciprocalRankFusion(lists [][]SearchHit, k int) []SearchHit {
	if k <= 0 {
		k = 60
	}
	scores := map[string]float64{}
	hits := map[string]SearchHit{}

	for _, list := range lists {
		for rank, hit := range list {
			key := hit.Ref + ":" + hit.Title + ":" + hit.Type
			scores[key] += 1.0 / (float64(k) + float64(rank+1))
			if existing, ok := hits[key]; !ok || hit.Score > existing.Score {
				hits[key] = hit
			}
		}
	}

	ranked := make([]RankedHit, 0, len(scores))
	for key, score := range scores {
		hit := hits[key]
		hit.Score = score
		ranked = append(ranked, RankedHit{Key: key, Hit: hit, Score: score})
	}
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].Score > ranked[j].Score
	})

	out := make([]SearchHit, 0, len(ranked))
	for _, item := range ranked {
		out = append(out, item.Hit)
	}
	return out
}
