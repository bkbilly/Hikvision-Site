package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/hikvision"
	"github.com/bkbilly/hikvision-site/pkg/models"
	"github.com/go-chi/chi/v5"
)

type CameraHandler struct {
	db        *db.DB
	camClient *hikvision.CameraClient
	crawler   *hikvision.Crawler
}

func NewCameraHandler(db *db.DB, camClient *hikvision.CameraClient, crawler *hikvision.Crawler) *CameraHandler {
	return &CameraHandler{
		db:        db,
		camClient: camClient,
		crawler:   crawler,
	}
}

func (h *CameraHandler) List(w http.ResponseWriter, r *http.Request) {
	cameras, err := h.db.ListCameras()
	if err != nil {
		writeJSONError(w, "Failed to list cameras: "+err.Error(), http.StatusInternalServerError)
		return
	}

	publicList := make([]models.CameraPublic, len(cameras))
	for i, c := range cameras {
		publicList[i] = c.ToPublic()
	}

	writeJSON(w, http.StatusOK, publicList)
}

func (h *CameraHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, cam.ToPublic())
}

type CreateCameraRequest struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IP        string `json:"ip"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	IsISAPI   bool   `json:"is_isapi"`
	Enabled   bool   `json:"enabled"`
	SortOrder int    `json:"sort_order"`
}

func (h *CameraHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSONError(w, "Camera name is required", http.StatusBadRequest)
		return
	}

	cam := &models.Camera{
		Name:      req.Name,
		Path:      strings.TrimSpace(req.Path),
		IP:        strings.TrimSpace(req.IP),
		Username:  strings.TrimSpace(req.Username),
		Password:  req.Password,
		IsISAPI:   req.IsISAPI,
		Enabled:   req.Enabled,
		SortOrder: req.SortOrder,
	}

	if err := h.db.CreateCamera(cam); err != nil {
		writeJSONError(w, "Failed to create camera: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Trigger background sync for this camera
	go func() {
		if cam.Enabled && cam.Path != "" {
			_, _ = h.crawler.SyncCamera(*cam)
		}
	}()

	writeJSON(w, http.StatusCreated, cam.ToPublic())
}

func (h *CameraHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	var req CreateCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	cam.Name = strings.TrimSpace(req.Name)
	cam.Path = strings.TrimSpace(req.Path)
	cam.IP = strings.TrimSpace(req.IP)
	cam.Username = strings.TrimSpace(req.Username)
	if req.Password != "" {
		cam.Password = req.Password
	}
	cam.IsISAPI = req.IsISAPI
	cam.Enabled = req.Enabled
	cam.SortOrder = req.SortOrder

	if err := h.db.UpdateCamera(cam); err != nil {
		writeJSONError(w, "Failed to update camera: "+err.Error(), http.StatusInternalServerError)
		return
	}

	go func() {
		if cam.Enabled && cam.Path != "" {
			_, _ = h.crawler.SyncCamera(*cam)
		}
	}()

	writeJSON(w, http.StatusOK, cam.ToPublic())
}

func (h *CameraHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	if err := h.db.DeleteCamera(id); err != nil {
		writeJSONError(w, "Failed to delete camera: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

type ReorderCamerasRequest struct {
	CameraIDs []int64 `json:"camera_ids"`
}

func (h *CameraHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req ReorderCamerasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.db.ReorderCameras(req.CameraIDs); err != nil {
		writeJSONError(w, "Failed to reorder cameras: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

type TestConnectionRequest struct {
	IP       string `json:"ip"`
	Username string `json:"username"`
	Password string `json:"password"`
	IsISAPI  bool   `json:"is_isapi"`
	CameraID *int64 `json:"camera_id,omitempty"`
}

func (h *CameraHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If camera_id is provided and password is empty, lookup existing password
	if req.CameraID != nil && *req.CameraID > 0 && req.Password == "" {
		existing, err := h.db.GetCamera(*req.CameraID)
		if err == nil {
			if req.IP == "" {
				req.IP = existing.IP
			}
			if req.Username == "" {
				req.Username = existing.Username
			}
			req.Password = existing.Password
			req.IsISAPI = existing.IsISAPI
		}
	}

	if req.IP == "" {
		writeJSONError(w, "Camera IP is required", http.StatusBadRequest)
		return
	}

	isISAPI, msg, err := h.camClient.TestConnection(req.IP, req.Username, req.Password)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"message":  msg,
		"is_isapi": isISAPI,
	})
}

func (h *CameraHandler) Snapshot(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		writeJSONError(w, "Camera has no IP configured", http.StatusBadRequest)
		return
	}

	data, err := h.camClient.FetchSnapshot(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to fetch snapshot from %s: %v", cam.IP, err), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *CameraHandler) StreamLive(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		writeJSONError(w, "Camera has no IP configured", http.StatusBadRequest)
		return
	}

	// Set headers for continuous multipart MJPEG stream
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=ffserver")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Connection", "close")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, isFlusher := w.(http.Flusher)
	if isFlusher {
		flusher.Flush()
	}

	ctx := r.Context()
	userEsc := url.QueryEscape(cam.Username)
	passEsc := url.QueryEscape(cam.Password)

	var rtspCandidates []string
	if cam.IsISAPI {
		rtspCandidates = []string{
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/101", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/sub/av_stream", userEsc, passEsc, cam.IP),
		}
	} else {
		rtspCandidates = []string{
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/102", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/sub/av_stream", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/101", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, cam.IP),
		}
	}

	// Continuous persistent stream loop: keeps the HTTP stream alive even across camera re-negotiations
	for {
		if ctx.Err() != nil {
			return
		}

		streamedAny := false

		// 1. Try RTSP live streaming via FFmpeg with zero-latency bufferless flags
		for _, rtspURL := range rtspCandidates {
			if ctx.Err() != nil {
				return
			}

			cmdCtx, cancelCmd := context.WithCancel(ctx)
			cmd := exec.CommandContext(cmdCtx, "ffmpeg",
				"-hide_banner",
				"-loglevel", "error",
				"-rtsp_transport", "tcp",
				"-stimeout", "3000000",
				"-fflags", "nobuffer",
				"-flags", "low_delay",
				"-probesize", "32768",
				"-analyzeduration", "0",
				"-i", rtspURL,
				"-an",
				"-c:v", "mjpeg",
				"-q:v", "5",
				"-r", "10",
				"-tune", "zerolatency",
				"-f", "mpjpeg",
				"-boundary_tag", "ffserver",
				"-",
			)

			stdout, err := cmd.StdoutPipe()
			if err != nil {
				cancelCmd()
				continue
			}

			if err := cmd.Start(); err != nil {
				cancelCmd()
				continue
			}

			n, _ := io.Copy(w, stdout)
			cancelCmd()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			_ = cmd.Wait()

			if ctx.Err() != nil {
				return
			}

			if n > 0 {
				streamedAny = true
				break
			}
		}

		// 2. Seamless fallback: stream snapshots if RTSP drops or fails, then retry RTSP
		if !streamedAny {
			ticker := time.NewTicker(250 * time.Millisecond)
			timeout := time.After(3 * time.Second)
			snapDone := false

			for !snapDone {
				select {
				case <-ctx.Done():
					ticker.Stop()
					return
				case <-timeout:
					ticker.Stop()
					snapDone = true
				case <-ticker.C:
					frame, err := h.camClient.FetchSnapshot(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
					if err == nil && len(frame) > 0 {
						_, err := fmt.Fprintf(w, "--ffserver\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n", len(frame))
						if err != nil {
							ticker.Stop()
							return
						}
						if _, err := w.Write(frame); err != nil {
							ticker.Stop()
							return
						}
						if _, err := w.Write([]byte("\r\n")); err != nil {
							ticker.Stop()
							return
						}
						if isFlusher {
							flusher.Flush()
						}
					}
				}
			}
		}
	}
}

type DiscoverPathRequest struct {
	Path string `json:"path"`
}

func (h *CameraHandler) DiscoverPath(w http.ResponseWriter, r *http.Request) {
	var req DiscoverPathRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	parser, err := hikvision.NewParser(0, req.Path)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"valid":   false,
			"message": err.Error(),
			"dirs":    []hikvision.DataDirInfo{},
		})
		return
	}

	dirs := parser.GetDataDirs()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"valid":   len(dirs) > 0,
		"message": fmt.Sprintf("Found %d data directory/directories", len(dirs)),
		"dirs":    dirs,
	})
}
