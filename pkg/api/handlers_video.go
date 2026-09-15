package api

import (
	"net/http"
	"strconv"

	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/hikvision"
	"github.com/go-chi/chi/v5"
)

type VideoHandler struct {
	db       *db.DB
	streamer *hikvision.Streamer
}

func NewVideoHandler(db *db.DB, streamer *hikvision.Streamer) *VideoHandler {
	return &VideoHandler{db: db, streamer: streamer}
}

func (h *VideoHandler) StreamClip(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	cameraID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(cameraID)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	q := r.URL.Query()
	datadirStr := q.Get("datadir")
	fileStr := q.Get("file")
	startOffsetStr := q.Get("start")
	endOffsetStr := q.Get("end")
	resolution := q.Get("resolution")

	datadirNum, err := strconv.Atoi(datadirStr)
	if err != nil {
		writeJSONError(w, "Invalid datadir parameter", http.StatusBadRequest)
		return
	}

	fileNum, err := strconv.ParseUint(fileStr, 10, 32)
	if err != nil {
		writeJSONError(w, "Invalid file parameter", http.StatusBadRequest)
		return
	}

	startOffset, err := strconv.ParseUint(startOffsetStr, 10, 32)
	if err != nil {
		writeJSONError(w, "Invalid start offset parameter", http.StatusBadRequest)
		return
	}

	endOffset, err := strconv.ParseUint(endOffsetStr, 10, 32)
	if err != nil {
		writeJSONError(w, "Invalid end offset parameter", http.StatusBadRequest)
		return
	}

	// Discover camera data directories to find exact data dir folder path
	parser, err := hikvision.NewParser(cameraID, cam.Path)
	if err != nil {
		writeJSONError(w, "Failed to resolve camera storage path: "+err.Error(), http.StatusInternalServerError)
		return
	}

	targetDir, err := parser.GetDataDirByIndex(datadirNum)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Extract & remux/transcode segment
	mp4Path, err := h.streamer.GetSegmentMP4(r.Context(), targetDir, datadirNum, uint32(fileNum), uint32(startOffset), uint32(endOffset), resolution)
	if err != nil {
		writeJSONError(w, "Failed to extract video clip: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Serve with full HTTP Range support
	h.streamer.ServeVideo(w, r, mp4Path)
}

func (h *VideoHandler) StreamThumbnail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	cameraID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(cameraID)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	q := r.URL.Query()
	datadirStr := q.Get("datadir")
	fileStr := q.Get("file")
	startOffsetStr := q.Get("start")
	endOffsetStr := q.Get("end")

	datadirNum, err := strconv.Atoi(datadirStr)
	if err != nil {
		writeJSONError(w, "Invalid datadir parameter", http.StatusBadRequest)
		return
	}

	fileNum, err := strconv.ParseUint(fileStr, 10, 32)
	if err != nil {
		writeJSONError(w, "Invalid file parameter", http.StatusBadRequest)
		return
	}

	startOffset, err := strconv.ParseUint(startOffsetStr, 10, 32)
	if err != nil {
		writeJSONError(w, "Invalid start offset parameter", http.StatusBadRequest)
		return
	}

	endOffset, err := strconv.ParseUint(endOffsetStr, 10, 32)
	if err != nil {
		writeJSONError(w, "Invalid end offset parameter", http.StatusBadRequest)
		return
	}

	parser, err := hikvision.NewParser(cameraID, cam.Path)
	if err != nil {
		writeJSONError(w, "Failed to resolve camera storage path: "+err.Error(), http.StatusInternalServerError)
		return
	}

	targetDir, err := parser.GetDataDirByIndex(datadirNum)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	position := q.Get("position")

	thumbPath, err := h.streamer.GetSegmentThumbnail(r.Context(), targetDir, datadirNum, uint32(fileNum), uint32(startOffset), uint32(endOffset), position)
	if err != nil {
		writeJSONError(w, "Failed to generate thumbnail: "+err.Error(), http.StatusInternalServerError)
		return
	}

	h.streamer.ServeThumbnail(w, r, thumbPath)
}

