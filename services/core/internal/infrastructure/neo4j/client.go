package neo4jstore

import (
	"context"
	"fmt"

	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Client struct {
	driver neo4j.DriverWithContext
}

func NewClient(uri, user, password string) (*Client, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("neo4j driver: %w", err)
	}
	ctx := context.Background()
	if err := driver.VerifyConnectivity(ctx); err != nil {
		_ = driver.Close(ctx)
		return nil, fmt.Errorf("neo4j connect: %w", err)
	}
	return &Client{driver: driver}, nil
}

func (c *Client) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

func (c *Client) UpsertRepoGraph(ctx context.Context, repoID string, graph map[string]interface{}) error {
	nodes, _ := graph["nodes"].([]map[string]interface{})
	edges, _ := graph["edges"].([]map[string]interface{})

	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MATCH (r:Repo {id: $repoId}) DETACH DELETE r
		`, map[string]any{"repoId": repoID})
		if err != nil {
			return nil, err
		}
		_, err = tx.Run(ctx, `
			CREATE (r:Repo {id: $repoId})
		`, map[string]any{"repoId": repoID})
		if err != nil {
			return nil, err
		}
		for _, node := range nodes {
			_, err = tx.Run(ctx, `
				MERGE (n:GraphNode {id: $id})
				SET n.label = $label, n.type = $type, n.repoId = $repoId
			`, map[string]any{
				"id": node["id"], "label": node["label"], "type": node["type"], "repoId": repoID,
			})
			if err != nil {
				return nil, err
			}
		}
		for _, edge := range edges {
			_, err = tx.Run(ctx, `
				MATCH (a:GraphNode {id: $source}), (b:GraphNode {id: $target})
				MERGE (a)-[r:REL {id: $id}]->(b)
				SET r.label = $label
			`, map[string]any{
				"id": edge["id"], "source": edge["source"], "target": edge["target"], "label": edge["label"],
			})
			if err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}

func (c *Client) DeleteRepoGraph(ctx context.Context, repoID string) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			MATCH (n:GraphNode {repoId: $repoId}) DETACH DELETE n
		`, map[string]any{"repoId": repoID})
		if err != nil {
			return nil, err
		}
		_, err = tx.Run(ctx, `
			MATCH (r:Repo {id: $repoId}) DETACH DELETE r
		`, map[string]any{"repoId": repoID})
		return nil, err
	})
	return err
}

type GraphNeighborRow struct {
	Title   string
	Snippet string
	Ref     string
	Score   float64
}

func (c *Client) QueryNeighbors(ctx context.Context, entity string, repoIDs []string, depth int) ([]GraphNeighborRow, error) {
	if c == nil || c.driver == nil {
		return nil, nil
	}

	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	repoFilter := ""
	params := map[string]any{"entity": entity, "depth": depth}
	if len(repoIDs) == 1 {
		repoFilter = "AND n.repoId = $repoId AND m.repoId = $repoId"
		params["repoId"] = repoIDs[0]
	}

	query := fmt.Sprintf(`
		MATCH (n:GraphNode)
		WHERE (n.label CONTAINS $entity OR n.id CONTAINS $entity) %s
		MATCH path = (n)-[:REL*1..%d]->(m:GraphNode)
		WITH n, m, relationships(path) AS rels
		RETURN n.label AS source, m.label AS target,
		       rels[0].label AS relLabel
		LIMIT 20
	`, repoFilter, depth)

	result, err := session.Run(ctx, query, params)
	if err != nil {
		return nil, err
	}

	rows := []GraphNeighborRow{}
	for result.Next(ctx) {
		record := result.Record()
		source, _ := record.Get("source")
		target, _ := record.Get("target")
		relLabel, _ := record.Get("relLabel")
		src := fmt.Sprint(source)
		tgt := fmt.Sprint(target)
		rel := fmt.Sprint(relLabel)
		rows = append(rows, GraphNeighborRow{
			Title:   fmt.Sprintf("%s → %s", src, tgt),
			Snippet: fmt.Sprintf("%s -[%s]-> %s", src, rel, tgt),
			Ref:     fmt.Sprintf("%s:%s", src, tgt),
			Score:   0.65,
		})
	}
	if err := result.Err(); err != nil {
		return nil, err
	}
	return rows, nil
}
