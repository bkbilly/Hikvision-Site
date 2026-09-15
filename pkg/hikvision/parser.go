package hikvision

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/models"
	_ "modernc.org/sqlite"
)

const (
	NasInfoLen = 68
	HeaderLen  = 1280
	FileLen    = 32
	SegmentLen = 80
)

type DataDirInfo struct {
	Index       int
	Path        string
	IndexFile   string
	IsSQLiteIdx bool
}

type Parser struct {
	cameraID  int64
	rootPath  string
	dataDirs  []DataDirInfo
}

func NewParser(cameraID int64, storagePath string) (*Parser, error) {
	p := &Parser{
		cameraID: cameraID,
		rootPath: storagePath,
	}

	if err := p.discoverDataDirs(); err != nil {
		return nil, err
	}

	return p, nil
}

func (p *Parser) discoverDataDirs() error {
	path := p.rootPath
	fi, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("storage path does not exist: %w", err)
	}

	var candidatePaths []string

	if !fi.IsDir() && strings.HasSuffix(strings.ToLower(path), "info.bin") {
		// Single info.bin file specified
		dirs, err := p.parseNASInfo(path)
		if err != nil {
			return fmt.Errorf("failed to parse %s: %w", path, err)
		}
		baseDir := filepath.Dir(path)
		for i := 0; i < dirs; i++ {
			candidatePaths = append(candidatePaths, filepath.Join(baseDir, fmt.Sprintf("datadir%d", i)))
		}
	} else if fi.IsDir() {
		infoPath := filepath.Join(path, "info.bin")
		if _, err := os.Stat(infoPath); err == nil {
			dirs, err := p.parseNASInfo(infoPath)
			if err == nil && dirs > 0 {
				for i := 0; i < dirs; i++ {
					candidatePaths = append(candidatePaths, filepath.Join(path, fmt.Sprintf("datadir%d", i)))
				}
			}
		}

		if len(candidatePaths) == 0 {
			// Check if the dir itself is a datadir or contains datadir* subdirectories
			entries, _ := os.ReadDir(path)
			for _, entry := range entries {
				if entry.IsDir() && strings.HasPrefix(entry.Name(), "datadir") {
					candidatePaths = append(candidatePaths, filepath.Join(path, entry.Name()))
				}
			}
			if len(candidatePaths) == 0 {
				// Treat current directory as single datadir
				candidatePaths = append(candidatePaths, path)
			}
		}
	}

	p.dataDirs = make([]DataDirInfo, 0, len(candidatePaths))
	for idx, dirPath := range candidatePaths {
		idxBin := filepath.Join(dirPath, "index00.bin")
		idxSql := filepath.Join(dirPath, "record_db_index00")

		if _, err := os.Stat(idxBin); err == nil {
			p.dataDirs = append(p.dataDirs, DataDirInfo{
				Index:       idx,
				Path:        dirPath,
				IndexFile:   idxBin,
				IsSQLiteIdx: false,
			})
		} else if _, err := os.Stat(idxSql); err == nil {
			p.dataDirs = append(p.dataDirs, DataDirInfo{
				Index:       idx,
				Path:        dirPath,
				IndexFile:   idxSql,
				IsSQLiteIdx: true,
			})
		}
	}

	return nil
}

func (p *Parser) parseNASInfo(infoFile string) (int, error) {
	f, err := os.Open(infoFile)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	buf := make([]byte, NasInfoLen)
	if _, err := io.ReadFull(f, buf); err != nil {
		return 0, err
	}

	// DataDirs is a 32-bit uint at offset 64
	dataDirs := binary.LittleEndian.Uint32(buf[64:68])
	return int(dataDirs), nil
}

func (p *Parser) GetDataDirs() []DataDirInfo {
	return p.dataDirs
}

func (p *Parser) GetDataDirByIndex(idx int) (string, error) {
	for _, dd := range p.dataDirs {
		if dd.Index == idx {
			return dd.Path, nil
		}
	}
	if idx >= 0 && idx < len(p.dataDirs) {
		return p.dataDirs[idx].Path, nil
	}
	// If path directly is datadir
	if len(p.dataDirs) == 1 {
		return p.dataDirs[0].Path, nil
	}
	return "", fmt.Errorf("data directory %d not found (found %d data dirs)", idx, len(p.dataDirs))
}

// ParseAllSegments parses all segments from all discovered data directories.
func (p *Parser) ParseAllSegments() ([]models.RecordingSegment, error) {
	var allSegments []models.RecordingSegment

	for _, dd := range p.dataDirs {
		var segs []models.RecordingSegment
		var err error
		if dd.IsSQLiteIdx {
			segs, err = p.parseSegmentsFromSQLite(dd)
		} else {
			segs, err = p.parseSegmentsFromBinary(dd)
		}
		if err != nil {
			// Log and continue with other datadirs
			continue
		}
		allSegments = append(allSegments, segs...)
	}

	return allSegments, nil
}

func (p *Parser) parseSegmentsFromSQLite(dd DataDirInfo) ([]models.RecordingSegment, error) {
	db, err := sql.Open("sqlite", dd.IndexFile+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query := `
		SELECT
			file_no,
			start_offset,
			end_offset,
			start_time_tv_sec,
			end_time_tv_sec,
			record_type
		FROM record_segment_idx_tb
		WHERE record_type != 0
	`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var segments []models.RecordingSegment
	for rows.Next() {
		var fileNum, startOffset, endOffset uint32
		var startTimeSec, endTimeSec int64
		var recordType uint8

		if err := rows.Scan(&fileNum, &startOffset, &endOffset, &startTimeSec, &endTimeSec, &recordType); err != nil {
			continue
		}

		if startTimeSec < 1420070400 || endTimeSec <= startTimeSec || startOffset >= endOffset || recordType == 0 {
			continue
		}

		segments = append(segments, models.RecordingSegment{
			CameraID:    p.cameraID,
			DataDirNum:  dd.Index,
			FileNum:     fileNum,
			StartOffset: startOffset,
			EndOffset:   endOffset,
			StartTime:   time.Unix(startTimeSec, 0).UTC(),
			EndTime:     time.Unix(endTimeSec, 0).UTC(),
			RecordType:  recordType,
		})
	}

	return segments, nil
}

func (p *Parser) parseSegmentsFromBinary(dd DataDirInfo) ([]models.RecordingSegment, error) {
	f, err := os.Open(dd.IndexFile)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	headerBuf := make([]byte, HeaderLen)
	if _, err := io.ReadFull(f, headerBuf); err != nil {
		return nil, err
	}

	avFiles := binary.LittleEndian.Uint32(headerBuf[12:16])
	if avFiles == 0 || avFiles > 10000 {
		return nil, fmt.Errorf("invalid avFiles count: %d", avFiles)
	}

	// Read FileRec table: avFiles * FileLen (32 bytes each)
	fileRecsBuf := make([]byte, int(avFiles)*FileLen)
	if _, err := io.ReadFull(f, fileRecsBuf); err != nil {
		return nil, fmt.Errorf("failed to read file records: %w", err)
	}

	type fileRec struct {
		fileNo     uint32
		chanNum    uint16
		segRecNums uint16
	}

	files := make([]fileRec, avFiles)
	for i := 0; i < int(avFiles); i++ {
		offset := i * FileLen
		files[i] = fileRec{
			fileNo:     binary.LittleEndian.Uint32(fileRecsBuf[offset : offset+4]),
			chanNum:    binary.LittleEndian.Uint16(fileRecsBuf[offset+4 : offset+6]),
			segRecNums: binary.LittleEndian.Uint16(fileRecsBuf[offset+6 : offset+8]),
		}
	}

	const maxSegmentsPerFile = 256
	segBuf := make([]byte, SegmentLen)
	var segments []models.RecordingSegment

	for fileIdx := uint32(0); fileIdx < avFiles; fileIdx++ {
		fr := files[fileIdx]

		// If channel is unallocated (0xFFFF) or has 0 segments, skip this file's segment block entirely
		if fr.chanNum == 0xFFFF || fr.segRecNums == 0 {
			if _, err := f.Seek(int64(maxSegmentsPerFile*SegmentLen), io.SeekCurrent); err != nil {
				break
			}
			continue
		}

		validCount := int(fr.segRecNums)
		if validCount > maxSegmentsPerFile {
			validCount = maxSegmentsPerFile
		}

		videoFilePath := filepath.Join(dd.Path, fmt.Sprintf("hiv%05d.mp4", fileIdx))
		var fileModUnix int64
		if fi, err := os.Stat(videoFilePath); err == nil {
			fileModUnix = fi.ModTime().Unix()
		}

		for segIdx := 0; segIdx < validCount; segIdx++ {
			n, err := io.ReadFull(f, segBuf)
			if err != nil || n < SegmentLen {
				break
			}

			segType := segBuf[0]
			startTimeRaw := binary.LittleEndian.Uint64(segBuf[8:16])
			endTimeRaw := binary.LittleEndian.Uint64(segBuf[16:24])

			// Extract 32-bit unix timestamps
			startTime := int64(uint32(startTimeRaw & 0xFFFFFFFF))
			endTime := int64(uint32(endTimeRaw & 0xFFFFFFFF))

			startOffset := binary.LittleEndian.Uint32(segBuf[40:44])
			endOffset := binary.LittleEndian.Uint32(segBuf[44:48])

			// Discard invalid types, corrupted timestamps (before year 2015), or invalid offset ranges
			if segType == 0 || startTime < 1420070400 || endTime <= startTime || startOffset >= endOffset {
				continue
			}

			// Discard stale overwritten ghost slots from previous rolling storage cycles
			if fileModUnix > 0 {
				if fileModUnix-endTime > 14*86400 || startTime > fileModUnix+86400 {
					continue
				}
			}

			segments = append(segments, models.RecordingSegment{
				CameraID:    p.cameraID,
				DataDirNum:  dd.Index,
				FileNum:     fileIdx,
				StartOffset: startOffset,
				EndOffset:   endOffset,
				StartTime:   time.Unix(startTime, 0).UTC(),
				EndTime:     time.Unix(endTime, 0).UTC(),
				RecordType:  segType,
			})
		}

		// Skip remaining unallocated or stale slots for this file
		unusedCount := maxSegmentsPerFile - validCount
		if unusedCount > 0 {
			if _, err := f.Seek(int64(unusedCount*SegmentLen), io.SeekCurrent); err != nil {
				break
			}
		}
	}

	return segments, nil
}
