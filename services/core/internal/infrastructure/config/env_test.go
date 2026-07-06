package config

import (
	"os"
	"testing"
)

func TestResolveMySQLDSN_shouldDeriveFromDockerPorts(t *testing.T) {
	t.Setenv("MYSQL_DSN", "")
	t.Setenv("MYSQL_HOST_PORT", "13306")
	t.Setenv("MYSQL_USER", "lingprism")
	t.Setenv("MYSQL_PASSWORD", "lingprism")
	t.Setenv("MYSQL_DATABASE", "lingprism")

	got := resolveMySQLDSN()
	want := "lingprism:lingprism@tcp(localhost:13306)/lingprism?parseTime=true"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResolveMySQLDSN_shouldRewriteLegacy3306DSN(t *testing.T) {
	t.Setenv("MYSQL_HOST_PORT", "")
	t.Setenv("MYSQL_DSN", "lingprism:lingprism@tcp(localhost:3306)/lingprism?parseTime=true")

	got := resolveMySQLDSN()
	want := "lingprism:lingprism@tcp(localhost:13306)/lingprism?parseTime=true"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}

	os.Unsetenv("MYSQL_DSN")
}

func TestResolveHTTPPort_shouldUseExplicitEnv(t *testing.T) {
	t.Setenv("CORE_HTTP_PORT", "19090")

	port, err := resolveHTTPPort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if port != 19090 {
		t.Fatalf("expected port 19090, got %d", port)
	}

	os.Unsetenv("CORE_HTTP_PORT")
}

func TestResolveHTTPPort_shouldFallbackWhen8080Unavailable(t *testing.T) {
	t.Setenv("CORE_HTTP_PORT", "")

	ln, err := listenTestPort(8080)
	if err != nil {
		t.Skip("cannot bind test listener on 8080")
	}
	defer ln.Close()

	port, err := resolveHTTPPort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if port != 18080 {
		t.Fatalf("expected fallback port 18080, got %d", port)
	}
}

func TestLoad_shouldDeriveMySQLDSNFromDockerDefaults(t *testing.T) {
	t.Setenv("MYSQL_DSN", "")
	t.Setenv("MYSQL_HOST_PORT", "13306")
	t.Setenv("CORE_HTTP_PORT", "19091")
	t.Setenv("CORE_GRPC_PORT", "50051")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantDSN := "lingprism:lingprism@tcp(localhost:13306)/lingprism?parseTime=true"
	if cfg.MySQLDSN != wantDSN {
		t.Fatalf("expected dsn %q, got %q", wantDSN, cfg.MySQLDSN)
	}
	if cfg.QdrantURL != "http://localhost:6335" {
		t.Fatalf("unexpected qdrant url: %s", cfg.QdrantURL)
	}
	if cfg.OpenSearchURL != "http://localhost:9201" {
		t.Fatalf("unexpected opensearch url: %s", cfg.OpenSearchURL)
	}

	os.Unsetenv("MYSQL_HOST_PORT")
	os.Unsetenv("CORE_HTTP_PORT")
}
