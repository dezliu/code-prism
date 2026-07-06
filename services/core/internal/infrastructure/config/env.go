package config

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// dockerPortKeys are loaded from infra/docker/.env with override so local docker
// port mappings win over stale root .env defaults (e.g. localhost:3306).
var dockerPortKeys = []string{
	"MYSQL_HOST_PORT",
	"MYSQL_USER",
	"MYSQL_PASSWORD",
	"MYSQL_DATABASE",
	"REDIS_HOST_PORT",
	"QDRANT_HOST_PORT",
	"OPENSEARCH_HOST_PORT",
	"NGINX_HOST_PORT",
}

// loadProjectEnv loads repo-level and service-level .env files. Docker overlay
// port keys override earlier values to align with infra/docker port mappings.
func loadProjectEnv() {
	cwd, err := os.Getwd()
	if err != nil {
		return
	}

	type envEntry struct {
		path     string
		override bool
	}

	candidates := []envEntry{
		{path: filepath.Join(cwd, "..", "..", ".env"), override: false},
		{path: filepath.Join(cwd, ".env"), override: false},
		{path: filepath.Join(cwd, "..", "..", "infra", "docker", ".env"), override: true},
	}

	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		abs, absErr := filepath.Abs(candidate.path)
		if absErr != nil {
			continue
		}
		if _, ok := seen[abs]; ok {
			continue
		}
		seen[abs] = struct{}{}
		loadEnvFile(abs, candidate.override)
	}
}

func loadEnvFile(path string, override bool) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)

		if key == "" {
			continue
		}

		_, exists := os.LookupEnv(key)
		if exists {
			if !override {
				continue
			}
			if !containsString(dockerPortKeys, key) {
				continue
			}
		}
		_ = os.Setenv(key, value)
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func resolveMySQLDSN() string {
	if hostPort, ok := os.LookupEnv("MYSQL_HOST_PORT"); ok && hostPort != "" {
		return buildMySQLDSN(hostPort)
	}

	if explicit := os.Getenv("MYSQL_DSN"); explicit != "" {
		// Root .env may still reference native 3306 while Docker maps MySQL to 13306.
		if strings.Contains(explicit, "localhost:3306)") {
			return buildMySQLDSN("13306")
		}
		return explicit
	}

	return buildMySQLDSN("13306")
}

func buildMySQLDSN(port string) string {
	user := getEnv("MYSQL_USER", "lingprism")
	password := getEnv("MYSQL_PASSWORD", "lingprism")
	database := getEnv("MYSQL_DATABASE", "lingprism")

	return fmt.Sprintf(
		"%s:%s@tcp(localhost:%s)/%s?parseTime=true",
		user,
		password,
		port,
		database,
	)
}

func resolveRedisURL() string {
	if explicit := os.Getenv("REDIS_URL"); explicit != "" {
		return explicit
	}

	port := getEnv("REDIS_HOST_PORT", "6379")
	return fmt.Sprintf("redis://localhost:%s/0", port)
}

func resolveQdrantURL() string {
	if explicit := os.Getenv("QDRANT_URL"); explicit != "" {
		return explicit
	}

	port := getEnv("QDRANT_HOST_PORT", "6335")
	return fmt.Sprintf("http://localhost:%s", port)
}

func resolveOpenSearchURL() string {
	if explicit := os.Getenv("OPENSEARCH_URL"); explicit != "" {
		return explicit
	}

	port := getEnv("OPENSEARCH_HOST_PORT", "9201")
	return fmt.Sprintf("http://localhost:%s", port)
}

func resolveHTTPPort() (int, error) {
	preferred := 8080
	if raw := os.Getenv("CORE_HTTP_PORT"); raw != "" {
		port, err := strconv.Atoi(raw)
		if err != nil {
			return 0, fmt.Errorf("invalid CORE_HTTP_PORT: %w", err)
		}
		preferred = port
	}

	if isPortAvailable(preferred) {
		return preferred, nil
	}

	if preferred == 8080 {
		return 18080, nil
	}

	return 0, fmt.Errorf("port %d already in use", preferred)
}

func isPortAvailable(port int) bool {
	ln, err := listenTestPort(port)
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}

func listenTestPort(port int) (net.Listener, error) {
	return net.Listen("tcp", fmt.Sprintf(":%d", port))
}
