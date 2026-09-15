package api

import (
	"net/http"
	"os/exec"
	"time"

	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/hikvision"
	"github.com/bkbilly/hikvision-site/pkg/models"
)

type SystemHandler struct {
	db        *db.DB
	crawler   *hikvision.Crawler
	streamer  *hikvision.Streamer
	startTime time.Time
	version   string
}

func NewSystemHandler(db *db.DB, crawler *hikvision.Crawler, streamer *hikvision.Streamer, version string) *SystemHandler {
	return &SystemHandler{
		db:        db,
		crawler:   crawler,
		streamer:  streamer,
		startTime: time.Now(),
		version:   version,
	}
}

func (h *SystemHandler) Status(w http.ResponseWriter, r *http.Request) {
	cams, _ := h.db.ListCameras()
	eventCount, _ := h.db.CountSegments()
	cacheMB := h.streamer.GetCacheSizeMB()

	ffmpegPath, err := exec.LookPath("ffmpeg")
	hasFFmpeg := err == nil

	uptime := int64(time.Since(h.startTime).Seconds())

	status := models.SystemStatus{
		Version:      h.version,
		CameraCount:  len(cams),
		EventCount:   eventCount,
		CacheSizeMB:  cacheMB,
		FFmpegPath:   ffmpegPath,
		HasFFmpeg:    hasFFmpeg,
		UptimeSec:    uptime,
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      status,
		"is_scanning": h.crawler.IsBusy(),
		"last_scan":   h.crawler.LastScanTime().Format(time.RFC3339),
	})
}

func (h *SystemHandler) Rescan(w http.ResponseWriter, r *http.Request) {
	if h.crawler.IsBusy() {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"message": "Scan already in progress",
			"running": true,
		})
		return
	}

	go h.crawler.SyncAll()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Background rescan initiated",
		"running": true,
	})
}

func (h *SystemHandler) ClearCache(w http.ResponseWriter, r *http.Request) {
	if err := h.streamer.ClearCache(); err != nil {
		writeJSONError(w, "Failed to clear cache: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Cache successfully cleared",
		"success": true,
	})
}
