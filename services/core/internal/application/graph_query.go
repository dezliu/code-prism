package application

import (
	"context"
	"strings"

	neo4jstore "github.com/lingprism/core/internal/infrastructure/neo4j"
)

type GraphQueryService struct {
	neo4j *neo4jstore.Client
}

func NewGraphQueryService(neo4j *neo4jstore.Client) *GraphQueryService {
	return &GraphQueryService{neo4j: neo4j}
}

type GraphNeighborInput struct {
	Entity  string
	RepoIDs []string
	Depth   int
}

func (g *GraphQueryService) Neighbors(ctx context.Context, input GraphNeighborInput) ([]SearchHit, error) {
	if g.neo4j == nil {
		return nil, nil
	}
	entity := strings.TrimSpace(input.Entity)
	if entity == "" {
		return nil, nil
	}
	depth := input.Depth
	if depth <= 0 {
		depth = 3
	}
	if depth > 5 {
		depth = 5
	}

	rows, err := g.neo4j.QueryNeighbors(ctx, entity, input.RepoIDs, depth)
	if err != nil {
		return nil, err
	}

	hits := make([]SearchHit, 0, len(rows))
	for _, row := range rows {
		hits = append(hits, SearchHit{
			Type:    "graph",
			Title:   row.Title,
			Snippet: row.Snippet,
			Ref:     row.Ref,
			Score:   row.Score,
		})
	}
	return hits, nil
}
