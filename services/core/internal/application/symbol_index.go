package application

import (
	"fmt"
	"path/filepath"
	"strings"

	idxclient "github.com/lingprism/core/internal/infrastructure/indexer"
	opensearchstore "github.com/lingprism/core/internal/infrastructure/opensearch"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

type repoMeta struct {
	ID   string
	Name string
	URL  string
}

func buildSymbolIndexRecords(
	outputs []idxclient.IndexerOutput,
	repo repoMeta,
	root string,
	dim int,
) ([]map[string]interface{}, []opensearchstore.CodeSymbolDocument) {
	points := []map[string]interface{}{}
	docs := []opensearchstore.CodeSymbolDocument{}
	idx := 1

	for _, out := range outputs {
		relPath := out.FilePath
		if relPath == "" {
			relPath = filepath.ToSlash(strings.TrimPrefix(out.FilePath, root))
		}

		for _, sym := range out.Parse.Symbols {
			methodName := idxclient.SymbolMethodName(sym)
			className := idxclient.SymbolClassName(sym)
			displayName := sym.Name
			if methodName == "" && className != "" {
				displayName = className
			}

			docComment := idxclient.DerefString(sym.DocComment)
			packageName := idxclient.DerefString(sym.PackageName)
			if packageName == "" {
				packageName = idxclient.DerefString(out.Parse.PackageName)
			}

			qualifiedRef := sym.QualifiedName
			if qualifiedRef == "" {
				qualifiedRef = sym.Name
			}
			if out.Parse.Language == "typescript" || out.Parse.Language == "javascript" {
				if className != "" && methodName != "" {
					qualifiedRef = fmt.Sprintf("%s::%s.%s", relPath, className, methodName)
				} else if className != "" {
					qualifiedRef = fmt.Sprintf("%s::%s", relPath, className)
				} else {
					qualifiedRef = fmt.Sprintf("%s::%s", relPath, sym.Name)
				}
			}

			snippetParts := []string{sym.Kind, sym.Name}
			if docComment != "" {
				snippetParts = append(snippetParts, docComment)
			}
			snippet := strings.Join(snippetParts, " ")

			embedText := snippet
			if docComment != "" {
				embedText = sym.Name + " " + docComment + " " + snippet
			}
			vec := qdrantclient.HashEmbed(embedText, dim)

			pointID := fmt.Sprintf("%s:%s:%d", repo.ID, qualifiedRef, sym.StartLine)
			payload := map[string]interface{}{
				"repoId": repo.ID, "repoName": repo.Name, "repoUrl": repo.URL,
				"filePath": relPath, "language": out.Parse.Language,
				"symbol": sym.Name, "kind": sym.Kind, "symbolKind": sym.Kind,
				"packageName": packageName, "className": className,
				"methodName": methodName, "startLine": sym.StartLine,
				"endLine": sym.EndLine, "docComment": docComment,
				"qualifiedRef": qualifiedRef, "snippet": snippet,
				"pointKey": pointID,
			}

			points = append(points, map[string]interface{}{
				"id":     idx,
				"vector": vec,
				"payload": payload,
			})
			idx++

			docID := fmt.Sprintf("code:%s:%s:%d", repo.ID, strings.ReplaceAll(qualifiedRef, "/", "_"), sym.StartLine)
			docs = append(docs, opensearchstore.CodeSymbolDocument{
				ID:           docID,
				Type:         "code_symbol",
				RepoID:       repo.ID,
				RepoName:     repo.Name,
				RepoURL:      repo.URL,
				FilePath:     relPath,
				Language:     out.Parse.Language,
				PackageName:  packageName,
				ClassName:    className,
				MethodName:   methodName,
				Symbol:       displayName,
				SymbolKind:   sym.Kind,
				StartLine:    sym.StartLine,
				EndLine:      sym.EndLine,
				DocComment:   docComment,
				QualifiedRef: qualifiedRef,
				Snippet:      snippet,
			})
		}
	}

	return points, docs
}

// buildQdrantPoints builds enriched vector points for code symbols.
func buildQdrantPoints(outputs []idxclient.IndexerOutput, repo repoMeta, root string, dim int) []map[string]interface{} {
	points, _ := buildSymbolIndexRecords(outputs, repo, root, dim)
	return points
}
