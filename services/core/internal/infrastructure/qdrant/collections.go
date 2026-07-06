package qdrant

import "fmt"

const (
	ProductPrefix     = "lingprism"
	CollectionVersion = "v1"
	DefaultProvider   = "zhipu"
	DefaultDim        = 1024
)

// ResolveCollectionName builds lingprism_{version}_{provider}_{dim}.
// Example: lingprism_v1_zhipu_1024
func ResolveCollectionName(provider string, dim int) string {
	if provider == "" {
		provider = DefaultProvider
	}
	if dim <= 0 {
		dim = DefaultDim
	}
	return fmt.Sprintf("%s_%s_%s_%d", ProductPrefix, CollectionVersion, provider, dim)
}
