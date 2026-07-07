package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/lingprism/core/internal/application"
)

type Handler struct {
	indexSvc         *application.IndexService
	searchSvc        *application.SearchService
	archSvc          *application.ArchitectureService
	graphSvc         *application.GraphQueryService
	symbolResolveSvc *application.SymbolResolveService
}

func NewHandler(
	index *application.IndexService,
	search *application.SearchService,
	arch *application.ArchitectureService,
	graph *application.GraphQueryService,
	symbolResolve *application.SymbolResolveService,
) *Handler {
	return &Handler{
		indexSvc: index, searchSvc: search, archSvc: arch,
		graphSvc: graph, symbolResolveSvc: symbolResolve,
	}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/internal/repos/test-connection", h.testConnection)
	mux.HandleFunc("/internal/repos/doc-context", h.buildDocContext)
	mux.HandleFunc("/internal/repos/arch-context", h.buildArchContext)
	mux.HandleFunc("/internal/index/enqueue", h.enqueueIndex)
	mux.HandleFunc("/internal/index/remove", h.removeIndex)
	mux.HandleFunc("/internal/index/jobs", h.listIndexJobs)
	mux.HandleFunc("/internal/search", h.handleSearch)
	mux.HandleFunc("/internal/search/hybrid", h.handleHybridSearch)
	mux.HandleFunc("/internal/symbols/resolve", h.handleSymbolResolve)
	mux.HandleFunc("/internal/symbols/resolve-stream", h.handleSymbolResolveStream)
	mux.HandleFunc("/internal/graph/neighbors", h.handleGraphNeighbors)
	mux.HandleFunc("/internal/knowledge/index", h.indexKnowledgeDoc)
	mux.HandleFunc("/internal/knowledge/remove", h.removeKnowledgeDoc)
	mux.HandleFunc("/internal/repos/webhook/", h.repoWebhook)
	mux.HandleFunc("/internal/architecture/", h.architecture)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (h *Handler) testConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var input application.TestConnectionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	result := h.indexSvc.TestConnection(r.Context(), input)
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) buildArchContext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RepoID string `json:"repoId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RepoID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repoId required"})
		return
	}
	result, err := h.indexSvc.BuildArchContext(r.Context(), body.RepoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) buildDocContext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RepoIDs []string `json:"repoIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.RepoIDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repoIds required"})
		return
	}
	result, err := h.indexSvc.BuildDocContext(r.Context(), body.RepoIDs)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) enqueueIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RepoID string `json:"repoId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RepoID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repoId required"})
		return
	}
	result, err := h.indexSvc.EnqueueIndex(r.Context(), body.RepoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) removeIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RepoID string `json:"repoId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RepoID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repoId required"})
		return
	}
	result, err := h.indexSvc.RemoveFromIndex(r.Context(), body.RepoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) listIndexJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	filter := application.IndexJobFilter{
		RepoID: r.URL.Query().Get("repoId"),
		Status: r.URL.Query().Get("status"),
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		fmt.Sscanf(raw, "%d", &filter.Limit)
	}
	jobs, err := h.indexSvc.ListIndexJobs(r.Context(), filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, jobs)
}

func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query().Get("q")
	repoIDs := []string{}
	if raw := r.URL.Query().Get("repoIds"); raw != "" {
		repoIDs = strings.Split(raw, ",")
	}
	result, err := h.searchSvc.Search(r.Context(), q, repoIDs)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleHybridSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Query   string   `json:"q"`
		RepoIDs []string `json:"repoIds"`
		Intent  string   `json:"intent"`
		Mode    string   `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	result, err := h.searchSvc.HybridSearch(r.Context(), application.HybridSearchInput{
		Query: body.Query, RepoIDs: body.RepoIDs, Intent: body.Intent, Mode: body.Mode,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleSymbolResolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if h.symbolResolveSvc == nil {
		writeJSON(w, http.StatusOK, application.SymbolResolveResult{Locations: []application.CodeLocation{}})
		return
	}
	var body application.SymbolResolveInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	result, err := h.symbolResolveSvc.Resolve(r.Context(), body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleSymbolResolveStream SSE 流式符号解析
func (h *Handler) handleSymbolResolveStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if h.symbolResolveSvc == nil {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		fmt.Fprintf(w, "event: results\ndata: {\"locations\":[]}\n\n")
		fmt.Fprintf(w, "event: done\ndata: {\"total\":0}\n\n")
		return
	}

	var body application.SymbolResolveInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, "event: error\ndata: {\"error\":\"invalid json\"}\n\n")
		return
	}

	// 设置 SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Nginx 缓冲禁用

	// 创建事件 channel
	events := make(chan application.StreamEvent, 10)

	// 在后台 goroutine 中执行流式解析
	go func() {
		defer close(events)
		h.symbolResolveSvc.ResolveStream(r.Context(), body, events)
	}()

	// 将事件流式写入响应
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	for event := range events {
		dataBytes, err := json.Marshal(event.Data)
		if err != nil {
			continue
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Event, string(dataBytes))
		flusher.Flush()
	}
}

func (h *Handler) handleGraphNeighbors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	entity := r.URL.Query().Get("entity")
	if entity == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "entity required"})
		return
	}
	repoIDs := []string{}
	if raw := r.URL.Query().Get("repoIds"); raw != "" {
		repoIDs = strings.Split(raw, ",")
	}
	depth := 3
	if raw := r.URL.Query().Get("depth"); raw != "" {
		if _, err := fmt.Sscanf(raw, "%d", &depth); err != nil {
			depth = 3
		}
	}
	if h.graphSvc == nil {
		writeJSON(w, http.StatusOK, application.SearchResult{Hits: []application.SearchHit{}})
		return
	}
	hits, err := h.graphSvc.Neighbors(r.Context(), application.GraphNeighborInput{
		Entity: entity, RepoIDs: repoIDs, Depth: depth,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, application.SearchResult{Hits: hits})
}

func (h *Handler) indexKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		DocID string `json:"docId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DocID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "docId required"})
		return
	}
	if err := h.searchSvc.IndexKnowledgeDoc(r.Context(), body.DocID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "docId": body.DocID})
}

func (h *Handler) removeKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		DocID string `json:"docId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DocID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "docId required"})
		return
	}
	if err := h.searchSvc.RemoveKnowledgeDoc(r.Context(), body.DocID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "docId": body.DocID, "removed": true})
}

// repoWebhook is reserved for Phase 4 Git push notifications (see docs/repo-webhook.md).
func (h *Handler) repoWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"error": "webhook not implemented; use polling via REPO_SYNC_INTERVAL_MINUTES",
	})
}

func (h *Handler) architecture(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/internal/architecture/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 || parts[1] != "generate-draft" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	repoID := parts[0]
	result, err := h.archSvc.GenerateDraft(r.Context(), repoID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}
