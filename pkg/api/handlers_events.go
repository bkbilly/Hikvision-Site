package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/hikvision"
	"github.com/bkbilly/hikvision-site/pkg/models"
)

type EventHandler struct {
	db      *db.DB
	crawler *hikvision.Crawler
}

func NewEventHandler(db *db.DB, crawler *hikvision.Crawler) *EventHandler {
	return &EventHandler{db: db, crawler: crawler}
}

type EventResponseItem struct {
	ID         int64  `json:"id"`
	CameraID   int64  `json:"camera_id"`
	Start      string `json:"start"`
	End        string `json:"end"`
	Group      int64  `json:"group"` // Matches camera ID for timeline grouping
	DataDir    int    `json:"datadir"`
	File       uint32 `json:"file"`
	VideoStart uint32 `json:"videoStart"`
	VideoEnd   uint32 `json:"videoEnd"`
	RecordType uint8  `json:"record_type"`
}

func (h *EventHandler) GetEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// Parse camera IDs
	var cameraIDs []int64
	camParam := q.Get("cameras")
	if camParam == "" {
		camParam = q.Get("camera_id")
	}
	if camParam != "" {
		for _, s := range strings.Split(camParam, ",") {
			s = strings.TrimSpace(s)
			if id, err := strconv.ParseInt(s, 10, 64); err == nil {
				cameraIDs = append(cameraIDs, id)
			}
		}
	}

	if len(cameraIDs) == 0 {
		// Default to all enabled cameras
		cams, _ := h.db.ListCameras()
		for _, c := range cams {
			if c.Enabled {
				cameraIDs = append(cameraIDs, c.ID)
			}
		}
	}

	if len(cameraIDs) == 0 {
		writeJSON(w, http.StatusOK, []EventResponseItem{})
		return
	}

	// Parse Start Date / Time
	var startTime time.Time
	startStr := q.Get("start")
	if startStr == "" {
		startStr = q.Get("start_time")
	}
	if t, ok := parseFlexibleTime(startStr); ok {
		startTime = t
	} else {
		// Default: past 24 hours
		startTime = time.Now().UTC().Add(-24 * time.Hour)
	}

	// Parse End Date / Time
	var endTime time.Time
	endStr := q.Get("end")
	if endStr == "" {
		endStr = q.Get("end_time")
	}
	if t, ok := parseFlexibleTime(endStr); ok {
		endTime = t
	} else {
		endTime = time.Now().UTC().Add(1 * time.Hour)
	}

	segments, err := h.db.QuerySegments(cameraIDs, startTime, endTime)
	if err != nil {
		writeJSONError(w, "Failed to query events: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// If no segments found in cache and we haven't scanned recently, trigger on-the-fly scan
	if len(segments) == 0 && h.crawler.LastScanTime().IsZero() {
		for _, camID := range cameraIDs {
			if cam, err := h.db.GetCamera(camID); err == nil && cam.Path != "" {
				_, _ = h.crawler.SyncCamera(*cam)
			}
		}
		segments, _ = h.db.QuerySegments(cameraIDs, startTime, endTime)
	}

	response := make([]EventResponseItem, len(segments))
	for i, seg := range segments {
		response[i] = EventResponseItem{
			ID:         seg.ID,
			CameraID:   seg.CameraID,
			Start:      seg.StartTime.Format("2006-01-02 15:04:05"),
			End:        seg.EndTime.Format("2006-01-02 15:04:05"),
			Group:      seg.CameraID,
			DataDir:    seg.DataDirNum,
			File:       seg.FileNum,
			VideoStart: seg.StartOffset,
			VideoEnd:   seg.EndOffset,
			RecordType: seg.RecordType,
		}
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *EventHandler) GetRecordingDates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var cameraIDs []int64
	camParam := q.Get("cameras")
	if camParam != "" {
		for _, s := range strings.Split(camParam, ",") {
			s = strings.TrimSpace(s)
			if id, err := strconv.ParseInt(s, 10, 64); err == nil {
				cameraIDs = append(cameraIDs, id)
			}
		}
	}

	dates, err := h.db.GetRecordingDates(cameraIDs)
	if err != nil {
		writeJSONError(w, "Failed to get recording dates: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if dates == nil {
		dates = []models.RecordingDateInfo{}
	}

	writeJSON(w, http.StatusOK, dates)
}

func parseFlexibleTime(val string) (time.Time, bool) {
	val = strings.TrimSpace(val)
	if val == "" {
		return time.Time{}, false
	}
	if unixSec, err := strconv.ParseInt(val, 10, 64); err == nil {
		return time.Unix(unixSec, 0).UTC(), true
	}
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, fmtStr := range formats {
		if t, err := time.Parse(fmtStr, val); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

