package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lingprism/core/internal/application"
)

func TestHealthHandler_shouldReturnOkWhenHealthEndpointCalled(t *testing.T) {
	handler := NewHealthHandler(application.NewHealthService())

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body["status"] != "ok" {
		t.Fatalf("expected status ok, got %q", body["status"])
	}
	if body["service"] != "core" {
		t.Fatalf("expected service core, got %q", body["service"])
	}
	if body["timestamp"] == "" {
		t.Fatal("expected timestamp to be set")
	}
}

func TestHealthHandler_shouldReturn404ForNonHealthPath(t *testing.T) {
	handler := NewHealthHandler(application.NewHealthService())

	req := httptest.NewRequest(http.MethodGet, "/unknown", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", rec.Code)
	}
}
