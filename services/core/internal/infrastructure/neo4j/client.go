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
