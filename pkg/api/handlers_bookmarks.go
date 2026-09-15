package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/models"
	"github.com/go-chi/chi/v5"
)

type BookmarkHandler struct {
	db *db.DB
}

func NewBookmarkHandler(db *db.DB) *BookmarkHandler {
	return &BookmarkHandler{db: db}
}

func (h *BookmarkHandler) List(w http.ResponseWriter, r *http.Request) {
	bookmarks, err := h.db.ListBookmarks()
	if err != nil {
		writeJSONError(w, "Failed to list bookmarks: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if bookmarks == nil {
		bookmarks = []models.Bookmark{}
	}
	writeJSON(w, http.StatusOK, bookmarks)
}

type CreateBookmarkRequest struct {
	CameraID   int64  `json:"camera_id"`
	CameraName string `json:"camera_name"`
	Title      string `json:"title"`
	Notes      string `json:"notes"`
	StartTime  string `json:"start_time"`
	EndTime    string `json:"end_time"`
	DataDir    int    `json:"datadir"`
	File       uint32 `json:"file"`
	VideoStart uint32 `json:"videoStart"`
	VideoEnd   uint32 `json:"videoEnd"`
	RecordType uint8  `json:"record_type"`
}

func (h *BookmarkHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateBookmarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = req.CameraName + " - " + req.StartTime
	}

	bookmark := &models.Bookmark{
		CameraID:   req.CameraID,
		CameraName: req.CameraName,
		Title:      req.Title,
		Notes:      strings.TrimSpace(req.Notes),
		StartTime:  req.StartTime,
		EndTime:    req.EndTime,
		DataDir:    req.DataDir,
		File:       req.File,
		VideoStart: req.VideoStart,
		VideoEnd:   req.VideoEnd,
		RecordType: req.RecordType,
	}

	if err := h.db.CreateBookmark(bookmark); err != nil {
		writeJSONError(w, "Failed to create bookmark: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, bookmark)
}

type UpdateBookmarkRequest struct {
	Title string `json:"title"`
	Notes string `json:"notes"`
}

func (h *BookmarkHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid bookmark ID", http.StatusBadRequest)
		return
	}

	var req UpdateBookmarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.db.UpdateBookmark(id, strings.TrimSpace(req.Title), strings.TrimSpace(req.Notes)); err != nil {
		writeJSONError(w, "Failed to update bookmark: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *BookmarkHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid bookmark ID", http.StatusBadRequest)
		return
	}

	if err := h.db.DeleteBookmark(id); err != nil {
		writeJSONError(w, "Failed to delete bookmark: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
