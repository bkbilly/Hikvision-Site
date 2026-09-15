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
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

type Streamer struct {
	cacheDir   string
	ffmpegSem  chan struct{}
	clipGroup  singleflight.Group
	thumbGroup singleflight.Group
	pruneMu    sync.Mutex
}

func NewStreamer(cacheDir string) (*Streamer, error) {
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache directory: %w", err)
	}

	maxWorkers := runtime.NumCPU()
	if maxWorkers < 2 {
		maxWorkers = 2
	} else if maxWorkers > 6 {
		maxWorkers = 6
	}

	return &Streamer{
		cacheDir:  cacheDir,
		ffmpegSem: make(chan struct{}, maxWorkers),
	}, nil
}

func (s *Streamer) GetCacheDir() string {
	return s.cacheDir
}

// findSyncOffset scans up to 2MB from startOffset to locate the first valid MPEG-PS
// pack header (00 00 01 ba) or PES/NAL start code to avoid unaligned corrupt prefix bytes.
func findSyncOffset(r io.ReaderAt, startOffset int64, length int64) int64 {
	scanSize := int64(2 * 1024 * 1024)
	if length > 0 && length < scanSize {
		scanSize = length
	}
	if scanSize <= 4 {
		return 0
	}

	buf := make([]byte, scanSize)
	n, err := r.ReadAt(buf, startOffset)
	if err != nil && err != io.EOF && n == 0 {
		return 0
	}
	buf = buf[:n]

	// Already aligned to MPEG-PS pack header
	if len(buf) >= 4 && buf[0] == 0x00 && buf[1] == 0x00 && buf[2] == 0x01 && buf[3] == 0xba {
		return 0
	}

	// 1. Search for MPEG-PS pack header: 00 00 01 ba
	psHeader := []byte{0x00, 0x00, 0x01, 0xba}
	if idx := bytes.Index(buf, psHeader); idx != -1 {
		return int64(idx)
	}

	// 2. Search for PES video packet header: 00 00 01 e0
	pesHeader := []byte{0x00, 0x00, 0x01, 0xe0}
	if idx := bytes.Index(buf, pesHeader); idx != -1 {
		return int64(idx)
	}

	// 3. Search for H.264 4-byte start code: 00 00 00 01
	nalHeader4 := []byte{0x00, 0x00, 0x00, 0x01}
	if idx := bytes.Index(buf, nalHeader4); idx != -1 {
		return int64(idx)
	}

	// 4. Search for standard 3-byte start code: 00 00 01
	nalHeader3 := []byte{0x00, 0x00, 0x01}
	if idx := bytes.Index(buf, nalHeader3); idx != -1 {
		return int64(idx)
	}

	return 0
}

// GetSegmentMP4 extracts the segment and remuxes/transcodes it to an MP4 file.
// Returns the absolute path of the ready MP4 file.
func (s *Streamer) GetSegmentMP4(ctx context.Context, dataDirPath string, dataDirNum int, fileNum uint32, startOffset, endOffset uint32, resolution string) (string, error) {
	resKey := resolution
	if resKey == "" || resKey == "null" || resKey == "original" {
		resKey = "orig"
	}

	cacheFileName := fmt.Sprintf("clip_%d_%d_%d_%d_%s.mp4", dataDirNum, fileNum, startOffset, endOffset, resKey)
	cacheFilePath := filepath.Join(s.cacheDir, cacheFileName)

	// Quick check if already transcoded and cached on disk
	if fi, err := os.Stat(cacheFilePath); err == nil && fi.Size() > 0 {
		return cacheFilePath, nil
	}

	// Deduplicate concurrent requests for the exact same clip
	flightKey := fmt.Sprintf("mp4_%d_%d_%d_%d_%s", dataDirNum, fileNum, startOffset, endOffset, resKey)
	res, err, _ := s.clipGroup.Do(flightKey, func() (interface{}, error) {
		// Double check after singleflight lock
		if fi, err := os.Stat(cacheFilePath); err == nil && fi.Size() > 0 {
			return cacheFilePath, nil
		}

		return s.extractAndRemuxMP4(ctx, dataDirPath, dataDirNum, fileNum, startOffset, endOffset, resKey, cacheFilePath)
	})

	if err != nil {
		return "", err
	}
	return res.(string), nil
}

func (s *Streamer) extractAndRemuxMP4(ctx context.Context, dataDirPath string, dataDirNum int, fileNum uint32, startOffset, endOffset uint32, resKey, cacheFilePath string) (string, error) {
	videoFileName := fmt.Sprintf("hiv%05d.mp4", fileNum)
	videoFilePath := filepath.Join(dataDirPath, videoFileName)

	if _, err := os.Stat(videoFilePath); err != nil {
		return "", fmt.Errorf("video chunk file %s not found: %w", videoFilePath, err)
	}

	length := int64(endOffset) - int64(startOffset)
	if length <= 0 {
		return "", fmt.Errorf("invalid offset range: start=%d, end=%d", startOffset, endOffset)
	}

	// Acquire worker slot with cancellation support
	select {
	case s.ffmpegSem <- struct{}{}:
		defer func() { <-s.ffmpegSem }()
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Open source chunk file and align to valid start code
	srcFile, err := os.Open(videoFilePath)
	if err != nil {
		return "", fmt.Errorf("failed to open video source: %w", err)
	}
	defer srcFile.Close()

	syncDelta := findSyncOffset(srcFile, int64(startOffset), length)
	actualStart := int64(startOffset) + syncDelta
	actualLength := length - syncDelta
	if actualLength <= 0 {
		actualStart = int64(startOffset)
		actualLength = length
	}

	if _, err := srcFile.Seek(actualStart, io.SeekStart); err != nil {
		return "", fmt.Errorf("failed to seek in video source: %w", err)
	}

	// 1. Extract raw stream slice to a temporary .dat file
	tempRawPath := filepath.Join(s.cacheDir, fmt.Sprintf("raw_%d_%d_%d_%d_%d.dat", dataDirNum, fileNum, startOffset, endOffset, time.Now().UnixNano()))
	rawFile, err := os.OpenFile(tempRawPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to create temp raw file: %w", err)
	}

	limitReader := io.LimitReader(srcFile, actualLength)
	buf := make([]byte, 64*1024)
	if _, err := io.CopyBuffer(rawFile, limitReader, buf); err != nil {
		rawFile.Close()
		_ = os.Remove(tempRawPath)
		return "", fmt.Errorf("failed to extract raw stream: %w", err)
	}
	rawFile.Close()
	defer os.Remove(tempRawPath)

	// 2. Remux / Transcode to standard MP4 with FFmpeg
	tempOutPath := cacheFilePath + fmt.Sprintf(".tmp_%d.mp4", time.Now().UnixNano())
	_ = os.Remove(tempOutPath)
	defer os.Remove(tempOutPath)

	cmdCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if resKey == "orig" {
		// Fast stream copy (usually 10-30ms)
		cmd = exec.CommandContext(
			cmdCtx,
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
		cmd = exec.CommandContext(
			cmdCtx,
			"ffmpeg", "-y",
			"-fflags", "+genpts",
			"-i", tempRawPath,
			"-threads", "auto",
			"-s", resKey,
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
		fallbackCmd := exec.CommandContext(
			cmdCtx,
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
			return "", fmt.Errorf("ffmpeg remuxing and fallback failed: %w (stderr: %s)", fallbackErr, fallbackStderr.String())
		}
	}

	if err := os.Rename(tempOutPath, cacheFilePath); err != nil {
		return "", fmt.Errorf("failed to finalize cached clip: %w", err)
	}

	return cacheFilePath, nil
}

// GetSegmentThumbnail extracts a single JPEG frame at the specified position ("middle" or "start").
func (s *Streamer) GetSegmentThumbnail(ctx context.Context, dataDirPath string, dataDirNum int, fileNum uint32, startOffset, endOffset uint32, position string) (string, error) {
	posKey := position
	if posKey != "start" && posKey != "middle" {
		posKey = "middle"
	}

	thumbFileName := fmt.Sprintf("thumb_%d_%d_%d_%d_%s.jpg", dataDirNum, fileNum, startOffset, endOffset, posKey)
	thumbFilePath := filepath.Join(s.cacheDir, thumbFileName)

	// Quick check if already generated and cached on disk
	if fi, err := os.Stat(thumbFilePath); err == nil && fi.Size() > 0 {
		return thumbFilePath, nil
	}

	// Deduplicate concurrent requests for the exact same thumbnail
	flightKey := fmt.Sprintf("thumb_%d_%d_%d_%d_%s", dataDirNum, fileNum, startOffset, endOffset, posKey)
	res, err, _ := s.thumbGroup.Do(flightKey, func() (interface{}, error) {
		// Double check after singleflight lock
		if fi, err := os.Stat(thumbFilePath); err == nil && fi.Size() > 0 {
			return thumbFilePath, nil
		}

		return s.extractThumbnail(ctx, dataDirPath, dataDirNum, fileNum, startOffset, endOffset, posKey, thumbFilePath)
	})

	if err != nil {
		return "", err
	}
	return res.(string), nil
}

func (s *Streamer) extractThumbnail(ctx context.Context, dataDirPath string, dataDirNum int, fileNum uint32, startOffset, endOffset uint32, position string, thumbFilePath string) (string, error) {
	videoFileName := fmt.Sprintf("hiv%05d.mp4", fileNum)
	videoFilePath := filepath.Join(dataDirPath, videoFileName)

	if _, err := os.Stat(videoFilePath); err != nil {
		return "", fmt.Errorf("video chunk file %s not found: %w", videoFilePath, err)
	}

	length := int64(endOffset) - int64(startOffset)
	if length <= 0 {
		return "", fmt.Errorf("invalid offset range: start=%d, end=%d", startOffset, endOffset)
	}

	// 1. First check if the MP4 clip is already transcoded and cached
	origClipPath := filepath.Join(s.cacheDir, fmt.Sprintf("clip_%d_%d_%d_%d_orig.mp4", dataDirNum, fileNum, startOffset, endOffset))
	if fi, err := os.Stat(origClipPath); err == nil && fi.Size() > 0 {
		tempOutPath := thumbFilePath + fmt.Sprintf(".tmp_%d.jpg", time.Now().UnixNano())
		defer os.Remove(tempOutPath)

		cmdCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()

		seekTime := "00:00:00.000"
		if position == "middle" {
			seekTime = "00:00:02.000"
		}

		cmd := exec.CommandContext(cmdCtx, "ffmpeg", "-y", "-ss", seekTime, "-i", origClipPath, "-vframes", "1", "-q:v", "3", tempOutPath)
		if err := cmd.Run(); err == nil {
			if err := os.Rename(tempOutPath, thumbFilePath); err == nil {
				return thumbFilePath, nil
			}
		}
	}

	// Acquire worker slot
	select {
	case s.ffmpegSem <- struct{}{}:
		defer func() { <-s.ffmpegSem }()
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// 2. Read slice from raw video chunk, aligned to start code
	srcFile, err := os.Open(videoFilePath)
	if err != nil {
		return "", fmt.Errorf("failed to open video source: %w", err)
	}
	defer srcFile.Close()

	var readStart int64
	var readLength int64

	if position == "middle" && length > 3*1024*1024 {
		// Seek to middle offset
		midOffset := int64(startOffset) + (length / 2)
		syncDelta := findSyncOffset(srcFile, midOffset, length/2)
		readStart = midOffset + syncDelta
		readLength = length - (readStart - int64(startOffset))
	} else {
		// Start frame
		syncDelta := findSyncOffset(srcFile, int64(startOffset), length)
		readStart = int64(startOffset) + syncDelta
		readLength = length - syncDelta
	}

	if readLength <= 0 {
		readStart = int64(startOffset)
		readLength = length
	}

	if _, err := srcFile.Seek(readStart, io.SeekStart); err != nil {
		return "", fmt.Errorf("failed to seek in video source: %w", err)
	}

	sliceLen := readLength
	if sliceLen > 2560*1024 {
		sliceLen = 2560 * 1024
	}

	tempRawPath := filepath.Join(s.cacheDir, fmt.Sprintf("raw_thumb_%d_%d_%d_%d_%d.dat", dataDirNum, fileNum, startOffset, endOffset, time.Now().UnixNano()))
	rawFile, err := os.OpenFile(tempRawPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to create temp raw file: %w", err)
	}

	limitReader := io.LimitReader(srcFile, sliceLen)
	if _, err := io.Copy(rawFile, limitReader); err != nil {
		rawFile.Close()
		_ = os.Remove(tempRawPath)
		return "", fmt.Errorf("failed to extract raw stream slice: %w", err)
	}
	rawFile.Close()
	defer os.Remove(tempRawPath)

	tempOutPath := thumbFilePath + fmt.Sprintf(".tmp_%d.jpg", time.Now().UnixNano())
	_ = os.Remove(tempOutPath)
	defer os.Remove(tempOutPath)

	cmdCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	// Try MPEG-PS demuxer first (Hikvision raw stream format)
	cmdMpeg := exec.CommandContext(cmdCtx, "ffmpeg", "-y", "-f", "mpeg", "-i", tempRawPath, "-vframes", "1", "-q:v", "3", tempOutPath)
	if err := cmdMpeg.Run(); err == nil {
		if err := os.Rename(tempOutPath, thumbFilePath); err == nil {
			return thumbFilePath, nil
		}
	}

	// Try auto format probing next
	cmdAuto := exec.CommandContext(cmdCtx, "ffmpeg", "-y", "-i", tempRawPath, "-vframes", "1", "-q:v", "3", tempOutPath)
	if err := cmdAuto.Run(); err == nil {
		if err := os.Rename(tempOutPath, thumbFilePath); err == nil {
			return thumbFilePath, nil
		}
	}

	// Fallback to generating full clip and extracting from MP4
	origClipPath = filepath.Join(s.cacheDir, fmt.Sprintf("clip_%d_%d_%d_%d_orig.mp4", dataDirNum, fileNum, startOffset, endOffset))
	mp4Path, mp4Err := s.extractAndRemuxMP4(cmdCtx, dataDirPath, dataDirNum, fileNum, startOffset, endOffset, "orig", origClipPath)
	if mp4Err != nil {
		return "", fmt.Errorf("thumbnail extraction fallback failed: %w", mp4Err)
	}

	seekTime := "00:00:00.000"
	if position == "middle" {
		seekTime = "00:00:02.000"
	}
	cmdMp4 := exec.CommandContext(cmdCtx, "ffmpeg", "-y", "-ss", seekTime, "-i", mp4Path, "-vframes", "1", "-q:v", "3", tempOutPath)
	if err := cmdMp4.Run(); err != nil {
		return "", fmt.Errorf("thumbnail extraction from mp4 failed: %w", err)
	}

	if err := os.Rename(tempOutPath, thumbFilePath); err != nil {
		return "", fmt.Errorf("failed to commit thumbnail: %w", err)
	}

	return thumbFilePath, nil
}

// ServeThumbnail serves the JPEG thumbnail with caching headers.
func (s *Streamer) ServeThumbnail(w http.ResponseWriter, r *http.Request, filePath string) {
	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Thumbnail not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	fi, err := file.Stat()
	if err != nil {
		http.Error(w, "Could not stat thumbnail", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	http.ServeContent(w, r, fi.Name(), fi.ModTime(), file)
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
	s.pruneMu.Lock()
	defer s.pruneMu.Unlock()

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
	s.pruneMu.Lock()
	defer s.pruneMu.Unlock()

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
		if strings.Contains(entry.Name(), ".tmp") || strings.HasSuffix(entry.Name(), ".dat") || now.Sub(info.ModTime()) > maxAge {
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
