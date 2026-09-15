package api

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os/exec"
	"strconv"
	"time"

	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/hikvision"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all local/LAN origins
	},
	ReadBufferSize:  4096,
	WriteBufferSize: 65536,
}

type WSHandler struct {
	db        *db.DB
	camClient *hikvision.CameraClient
}

func NewWSHandler(db *db.DB, camClient *hikvision.CameraClient) *WSHandler {
	return &WSHandler{
		db:        db,
		camClient: camClient,
	}
}

// splitJPEG extracts individual JPEG images from continuous stream
func splitJPEG(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	// Find SOI marker (0xFF, 0xD8)
	soi := bytes.Index(data, []byte{0xFF, 0xD8})
	if soi == -1 {
		if atEOF {
			return len(data), nil, nil
		}
		return 0, nil, nil
	}
	// Find EOI marker (0xFF, 0xD9) after SOI
	eoiRel := bytes.Index(data[soi+2:], []byte{0xFF, 0xD9})
	if eoiRel == -1 {
		if atEOF {
			return len(data), nil, nil
		}
		return soi, nil, nil
	}
	eoi := soi + 2 + eoiRel + 2
	return eoi, data[soi:eoi], nil
}

func (h *WSHandler) StreamLiveWS(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("cameraId")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil || cam == nil {
		http.Error(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		http.Error(w, "Camera has no IP configured", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Read pump detects client disconnect/navigation immediately
	go func() {
		defer cancel()
		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				return
			}
		}
	}()

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

	for {
		if ctx.Err() != nil {
			return
		}

		streamedAny := false

		// 1. Try RTSP live streaming via FFmpeg with zero latency
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
				"-f", "image2pipe",
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

			scanner := bufio.NewScanner(stdout)
			scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
			scanner.Split(splitJPEG)

			for scanner.Scan() {
				if ctx.Err() != nil {
					break
				}
				frame := scanner.Bytes()
				if len(frame) > 0 {
					streamedAny = true
					ws.SetWriteDeadline(time.Now().Add(2 * time.Second))
					if err := ws.WriteMessage(websocket.BinaryMessage, frame); err != nil {
						cancelCmd()
						if cmd.Process != nil {
							_ = cmd.Process.Kill()
						}
						_ = cmd.Wait()
						return
					}
				}
			}

			cancelCmd()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			_ = cmd.Wait()

			if ctx.Err() != nil {
				return
			}

			if streamedAny {
				break
			}
		}

		// 2. Seamless fallback: snapshot polling over WebSocket
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
						ws.SetWriteDeadline(time.Now().Add(2 * time.Second))
						if err := ws.WriteMessage(websocket.BinaryMessage, frame); err != nil {
							ticker.Stop()
							return
						}
					}
				}
			}
		}
	}
}
