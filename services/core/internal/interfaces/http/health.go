package http

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/lingprism/core/internal/application"
)

type HealthHandler struct {
	health *application.HealthService
}

func NewHealthHandler(health *application.HealthService) *HealthHandler {
	return &HealthHandler{health: health}
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/health" || r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":    h.health.Status()["status"],
		"service":   h.health.Status()["service"],
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
