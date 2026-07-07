package indexer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Symbol struct {
	Name          string  `json:"name"`
	Kind          string  `json:"kind"`
	StartLine     int     `json:"start_line"`
	EndLine       int     `json:"end_line"`
	ClassName     *string `json:"class_name,omitempty"`
	PackageName   *string `json:"package_name,omitempty"`
	DocComment    *string `json:"doc_comment,omitempty"`
	QualifiedName string  `json:"qualified_name"`
}

type GraphEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
}

type IndexerOutput struct {
	FilePath string `json:"file_path"`
	Parse    struct {
		Language    string   `json:"language"`
		PackageName *string  `json:"package_name,omitempty"`
		Symbols     []Symbol `json:"symbols"`
	} `json:"parse"`
	Edges   []GraphEdge `json:"edges"`
	Version string      `json:"version"`
}

type Client struct {
	binary string
}

func NewClient(binary string) *Client {
	if binary == "" {
		binary = "lingprism-indexer"
	}
	return &Client{binary: binary}
}

func (c *Client) IndexDirectory(ctx context.Context, root string) ([]IndexerOutput, error) {
	outputs := []IndexerOutput{}
	langByExt := map[string]string{
		".rs": "rust", ".ts": "typescript", ".tsx": "typescript",
		".js": "javascript", ".jsx": "javascript", ".go": "go",
	}

	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() {
			if info != nil && info.IsDir() && (info.Name() == ".git" || info.Name() == "node_modules" || info.Name() == "target") {
				return filepath.SkipDir
			}
			return nil
		}
		ext := filepath.Ext(path)
		language, ok := langByExt[ext]
		if !ok {
			return nil
		}
		out, err := c.parseFile(ctx, language, path, root)
		if err != nil {
			return nil
		}
		if len(out.Parse.Symbols) > 0 {
			outputs = append(outputs, out)
		}
		return nil
	})
	return outputs, err
}

func (c *Client) parseFile(ctx context.Context, language, filePath, root string) (IndexerOutput, error) {
	cmd := exec.CommandContext(ctx, c.binary, "parse", "--language", language, "--file", filePath)
	raw, err := cmd.Output()
	if err != nil {
		return IndexerOutput{}, fmt.Errorf("indexer parse %s: %w", filePath, err)
	}
	var output IndexerOutput
	if err := json.Unmarshal(raw, &output); err != nil {
		return IndexerOutput{}, fmt.Errorf("decode indexer output: %w", err)
	}
	rel, err := filepath.Rel(root, filePath)
	if err != nil {
		rel = filePath
	}
	output.FilePath = filepath.ToSlash(rel)
	return output, nil
}

func BuildGraphFromOutputs(outputs []IndexerOutput, repoID string) map[string]interface{} {
	nodes := []map[string]interface{}{}
	edges := []map[string]interface{}{}
	seenNodes := map[string]bool{}

	addNode := func(id, label, nodeType string) {
		if seenNodes[id] {
			return
		}
		seenNodes[id] = true
		nodes = append(nodes, map[string]interface{}{
			"id": id, "label": label, "type": nodeType,
		})
	}

	addNode(repoID, "Repository", "module")
	for _, out := range outputs {
		moduleID := fmt.Sprintf("%s:%s", repoID, out.Parse.Language)
		addNode(moduleID, strings.Title(out.Parse.Language), "module")
		edges = append(edges, map[string]interface{}{
			"id": fmt.Sprintf("e-%s-%s", repoID, moduleID),
			"source": repoID, "target": moduleID, "label": "contains",
		})
		for _, sym := range out.Parse.Symbols {
			symID := fmt.Sprintf("%s:%s", moduleID, sym.Name)
			nodeType := "module"
			if sym.Kind == "function_item" || strings.Contains(sym.Kind, "function") || strings.Contains(sym.Kind, "method") {
				nodeType = "service"
			}
			addNode(symID, sym.Name, nodeType)
			edges = append(edges, map[string]interface{}{
				"id": fmt.Sprintf("e-%s-%s", moduleID, symID),
				"source": moduleID, "target": symID, "label": sym.Kind,
			})
		}
		for _, edge := range out.Edges {
			edges = append(edges, map[string]interface{}{
				"id": fmt.Sprintf("e-%s-%s", edge.From, edge.To),
				"source": edge.From, "target": edge.To, "label": edge.Kind,
			})
		}
	}

	return map[string]interface{}{"nodes": nodes, "edges": edges}
}

func SymbolMethodName(sym Symbol) string {
	if strings.Contains(sym.Kind, "function") || strings.Contains(sym.Kind, "method") {
		return sym.Name
	}
	return ""
}

func SymbolClassName(sym Symbol) string {
	if sym.ClassName != nil && *sym.ClassName != "" {
		return *sym.ClassName
	}
	if strings.Contains(sym.Kind, "class") || strings.Contains(sym.Kind, "struct") || strings.Contains(sym.Kind, "type") {
		return sym.Name
	}
	return ""
}

func DerefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
