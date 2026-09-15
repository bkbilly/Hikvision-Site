package hikvision

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Streamer struct {
	cacheDir string
	mu       sync.Mutex
}

func NewStreamer(cacheDir string) (*Streamer, error) {
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache directory: %w", err)
	}
	return &Streamer{cacheDir: cacheDir}, nil
}

func (s *Streamer) GetCacheDir() string {
	return s.cacheDir
}

// GetSegmentMP4 extracts the segment and remuxes/transcodes it to an MP4 file.
// Returns the absolute path of the ready MP4 file.
func (s *Streamer) GetSegmentMP4(dataDirPath string, dataDirNum int, fileNum uint32, startOffset, endOffset uint32, resolution string) (string, error) {
	videoFileName := fmt.Sprintf("hiv%05d.mp4", fileNum)
	videoFilePath := filepath.Join(dataDirPath, videoFileName)

	if _, err := os.Stat(videoFilePath); err != nil {
		return "", fmt.Errorf("video chunk file %s not found: %w", videoFilePath, err)
	}

	resKey := resolution
	if resKey == "" || resKey == "null" || resKey == "original" {
		resKey = "orig"
	}

	cacheFileName := fmt.Sprintf("clip_%d_%d_%d_%d_%s.mp4", dataDirNum, fileNum, startOffset, endOffset, resKey)
	cacheFilePath := filepath.Join(s.cacheDir, cacheFileName)

	// Check if already transcoded and cached
	if fi, err := os.Stat(cacheFilePath); err == nil && fi.Size() > 0 {
		return cacheFilePath, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Double check after acquiring lock
	if fi, err := os.Stat(cacheFilePath); err == nil && fi.Size() > 0 {
		return cacheFilePath, nil
	}

	// Open source chunk file and seek to startOffset
	srcFile, err := os.Open(videoFilePath)
	if err != nil {
		return "", fmt.Errorf("failed to open video source: %w", err)
	}
	defer srcFile.Close()

	if _, err := srcFile.Seek(int64(startOffset), io.SeekStart); err != nil {
		return "", fmt.Errorf("failed to seek in video source: %w", err)
	}

	length := int64(endOffset) - int64(startOffset)
	if length <= 0 {
		return "", fmt.Errorf("invalid offset range: start=%d, end=%d", startOffset, endOffset)
	}

	// 1. Extract raw stream slice to a temporary .dat file (allows FFmpeg format auto-probe for MPEG-PS / H.264)
	tempRawPath := filepath.Join(s.cacheDir, fmt.Sprintf("raw_%d_%d_%d_%d.dat", dataDirNum, fileNum, startOffset, endOffset))
	rawFile, err := os.OpenFile(tempRawPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to create temp raw file: %w", err)
	}

	limitReader := io.LimitReader(srcFile, length)
	buf := make([]byte, 64*1024)
	if _, err := io.CopyBuffer(rawFile, limitReader, buf); err != nil {
		rawFile.Close()
		_ = os.Remove(tempRawPath)
		return "", fmt.Errorf("failed to extract raw stream: %w", err)
	}
	rawFile.Close()
	defer os.Remove(tempRawPath)

	// 2. Remux / Transcode to standard MP4 with FFmpeg
	tempOutPath := cacheFilePath + ".tmp.mp4"
	_ = os.Remove(tempOutPath)

	var cmd *exec.Cmd
	if resKey == "orig" {
		// Fast stream copy (usually 10-30ms)
		cmd = exec.Command(
			"ffmpeg", "-y",
			"-fflags", "+genpts",
			"-i", tempRawPath,
			"-threads", "auto",
			"-c:v", "copy",
			"-an",
			"-avoid_negative_ts", "make_zero",
			"-movflags", "+faststart",
			"-f", "mp4",
			tempOutPath,
		)
	} else {
		// Transcode to specific resolution
		cmd = exec.Command(
			"ffmpeg", "-y",
			"-fflags", "+genpts",
			"-i", tempRawPath,
			"-threads", "auto",
			"-s", resolution,
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-crf", "23",
			"-an",
			"-avoid_negative_ts", "make_zero",
			"-movflags", "+faststart",
			"-f", "mp4",
			tempOutPath,
		)
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("[Streamer] Remux copy failed (%v): %s", err, stderr.String())
		// If copy failed, fall back to ultrafast transcode
		var fallbackStderr bytes.Buffer
		fallbackCmd := exec.Command(
			"ffmpeg", "-y",
			"-fflags", "+genpts",
			"-i", tempRawPath,
			"-threads", "auto",
			"-c:v", "libx264",
			"-preset", "ultrafast",
			"-crf", "22",
			"-an",
			"-avoid_negative_ts", "make_zero",
			"-movflags", "+faststart",
			"-f", "mp4",
			tempOutPath,
		)
		fallbackCmd.Stderr = &fallbackStderr
		if fallbackErr := fallbackCmd.Run(); fallbackErr != nil {
			_ = os.Remove(tempOutPath)
			return "", fmt.Errorf("ffmpeg remuxing and fallback failed: %w (stderr: %s)", fallbackErr, fallbackStderr.String())
		}
	}

	if err := os.Rename(tempOutPath, cacheFilePath); err != nil {
		return "", fmt.Errorf("failed to finalize cached clip: %w", err)
	}

	return cacheFilePath, nil
}

// ServeVideo serves the MP4 file using standard HTTP Range handling.
func (s *Streamer) ServeVideo(w http.ResponseWriter, r *http.Request, filePath string) {
	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Video file not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	fi, err := file.Stat()
	if err != nil {
		http.Error(w, "Could not stat file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeContent(w, r, fi.Name(), fi.ModTime(), file)
}

// GetCacheSizeMB returns total size of cached clips.
func (s *Streamer) GetCacheSizeMB() int64 {
	var totalBytes int64
	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			if info, err := entry.Info(); err == nil {
				totalBytes += info.Size()
			}
		}
	}
	return totalBytes / (1024 * 1024)
}

// ClearCache removes all cached clips.
func (s *Streamer) ClearCache() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			_ = os.Remove(filepath.Join(s.cacheDir, entry.Name()))
		}
	}
	return nil
}

type cacheFileInfo struct {
	path    string
	size    int64
	modTime time.Time
}

// AutoPrune deletes old or expired cached MP4/tmp files and enforces max cache size limit.
func (s *Streamer) AutoPrune(maxAge time.Duration, maxSizeBytes int64) (int, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		return 0, 0, err
	}

	var files []cacheFileInfo
	var totalSize int64
	var prunedCount int
	var freedBytes int64
	now := time.Now()

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		fullPath := filepath.Join(s.cacheDir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}

		// Delete temporary or orphaned .tmp files or files older than maxAge
		if strings.HasSuffix(entry.Name(), ".tmp.mp4") || strings.HasSuffix(entry.Name(), ".dat") || now.Sub(info.ModTime()) > maxAge {
			if err := os.Remove(fullPath); err == nil {
				prunedCount++
				freedBytes += info.Size()
				continue
			}
		}

		files = append(files, cacheFileInfo{
			path:    fullPath,
			size:    info.Size(),
			modTime: info.ModTime(),
		})
		totalSize += info.Size()
	}

	// If total size still exceeds maxSizeBytes, remove oldest files first
	if maxSizeBytes > 0 && totalSize > maxSizeBytes {
		sort.Slice(files, func(i, j int) bool {
			return files[i].modTime.Before(files[j].modTime)
		})

		for _, f := range files {
			if totalSize <= maxSizeBytes {
				break
			}
			if err := os.Remove(f.path); err == nil {
				prunedCount++
				freedBytes += f.size
				totalSize -= f.size
			}
		}
	}

	return prunedCount, freedBytes, nil
}

// StartAutoPruner starts a background goroutine that periodically cleans up expired cache files.
func (s *Streamer) StartAutoPruner(ctx context.Context, maxAge time.Duration, maxSizeBytes int64, interval time.Duration) {
	go func() {
		// Run initial prune after brief startup delay
		time.Sleep(5 * time.Second)
		if count, freed, err := s.AutoPrune(maxAge, maxSizeBytes); err == nil && count > 0 {
			log.Printf("[Streamer] Cache auto-pruner freed %.2f MB (%d files)", float64(freed)/(1024*1024), count)
		}

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if count, freed, err := s.AutoPrune(maxAge, maxSizeBytes); err == nil && count > 0 {
					log.Printf("[Streamer] Cache auto-pruner freed %.2f MB (%d files)", float64(freed)/(1024*1024), count)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}
