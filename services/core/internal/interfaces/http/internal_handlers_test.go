package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInternalHandlers_SearchMethodNotAllowed(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodPost, "/internal/search?q=test", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestInternalHandlers_TestConnectionInvalidJSON(t *testing.T) {
	h := NewHandler(nil, nil, nil, nil)
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodPost, "/internal/repos/test-connection", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
