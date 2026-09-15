package hikvision

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHikvisionBinaryParser(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "hik_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create mock info.bin
	infoPath := filepath.Join(tempDir, "info.bin")
	infoData := make([]byte, NasInfoLen)
	copy(infoData[0:48], []byte("TEST-SERIAL-NUMBER-1234567890"))
	copy(infoData[48:54], []byte{0x00, 0x11, 0x22, 0x33, 0x44, 0x55}) // MAC
	binary.LittleEndian.PutUint32(infoData[56:60], 4096)               // f_bsize
	binary.LittleEndian.PutUint32(infoData[60:64], 1000000)            // f_blocks
	binary.LittleEndian.PutUint32(infoData[64:68], 1)                  // DataDirs = 1
	if err := os.WriteFile(infoPath, infoData, 0644); err != nil {
		t.Fatalf("Failed to write info.bin: %v", err)
	}

	// Create datadir0
	datadir0 := filepath.Join(tempDir, "datadir0")
	if err := os.MkdirAll(datadir0, 0755); err != nil {
		t.Fatalf("Failed to create datadir0: %v", err)
	}

	// Create mock index00.bin
	// Header: 1280 bytes
	// File table: 1 file * 32 bytes
	// Segments table: 1 file * 256 segments * 80 bytes
	avFiles := uint32(1)
	header := make([]byte, HeaderLen)
	binary.LittleEndian.PutUint64(header[0:8], uint64(time.Now().Unix())) // modifyTimes
	binary.LittleEndian.PutUint32(header[8:12], 1)                        // version
	binary.LittleEndian.PutUint32(header[12:16], avFiles)                 // avFiles = 1

	fileRecords := make([]byte, FileLen*int(avFiles))
	binary.LittleEndian.PutUint32(fileRecords[0:4], 0)     // fileNo = 0
	binary.LittleEndian.PutUint16(fileRecords[4:6], 1)     // chan = 1
	binary.LittleEndian.PutUint16(fileRecords[6:8], 1)     // segRecNums = 1
	binary.LittleEndian.PutUint32(fileRecords[8:12], 1000) // startTime
	binary.LittleEndian.PutUint32(fileRecords[12:16], 2000)

	segmentRecords := make([]byte, 256*SegmentLen)
	// Segment 0
	seg0 := segmentRecords[0:SegmentLen]
	seg0[0] = 1                                                             // type = 1 (motion event)
	nowUnix := uint64(time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC).Unix()) // startTime
	endUnix := nowUnix + 60                                                 // endTime (+60s)
	binary.LittleEndian.PutUint64(seg0[8:16], nowUnix)
	binary.LittleEndian.PutUint64(seg0[16:24], endUnix)
	binary.LittleEndian.PutUint32(seg0[40:44], 1024)  // startOffset
	binary.LittleEndian.PutUint32(seg0[44:48], 102400) // endOffset

	var fullIndex []byte
	fullIndex = append(fullIndex, header...)
	fullIndex = append(fullIndex, fileRecords...)
	fullIndex = append(fullIndex, segmentRecords...)

	indexPath := filepath.Join(datadir0, "index00.bin")
	if err := os.WriteFile(indexPath, fullIndex, 0644); err != nil {
		t.Fatalf("Failed to write index00.bin: %v", err)
	}

	// Test parser
	parser, err := NewParser(1, infoPath)
	if err != nil {
		t.Fatalf("Failed to initialize parser: %v", err)
	}

	dataDirs := parser.GetDataDirs()
	if len(dataDirs) != 1 {
		t.Fatalf("Expected 1 datadir, got %d", len(dataDirs))
	}

	segments, err := parser.ParseAllSegments()
	if err != nil {
		t.Fatalf("Failed to parse segments: %v", err)
	}

	if len(segments) != 1 {
		t.Fatalf("Expected 1 segment, got %d", len(segments))
	}

	seg := segments[0]
	if seg.DataDirNum != 0 || seg.FileNum != 0 || seg.StartOffset != 1024 || seg.EndOffset != 102400 {
		t.Fatalf("Segment data mismatch: %+v", seg)
	}

	if seg.StartTime.Unix() != int64(nowUnix) || seg.EndTime.Unix() != int64(endUnix) {
		t.Fatalf("Segment timestamp mismatch: got start=%v end=%v, want start=%v end=%v",
			seg.StartTime.Unix(), seg.EndTime.Unix(), nowUnix, endUnix)
	}
}

func TestHikvisionStaleSegmentsIgnored(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "hik_test_stale_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	infoPath := filepath.Join(tempDir, "info.bin")
	infoData := make([]byte, NasInfoLen)
	binary.LittleEndian.PutUint32(infoData[64:68], 1) // DataDirs = 1
	if err := os.WriteFile(infoPath, infoData, 0644); err != nil {
		t.Fatalf("Failed to write info.bin: %v", err)
	}

	datadir0 := filepath.Join(tempDir, "datadir0")
	if err := os.MkdirAll(datadir0, 0755); err != nil {
		t.Fatalf("Failed to create datadir0: %v", err)
	}

	// 2 files:
	// File 0: chan = 1, segRecNums = 1 (valid 1 segment, slot 1 has stale data)
	// File 1: chan = 0xFFFF (unallocated, but has stale data in its slots)
	avFiles := uint32(2)
	header := make([]byte, HeaderLen)
	binary.LittleEndian.PutUint32(header[12:16], avFiles)

	fileRecords := make([]byte, FileLen*int(avFiles))
	// File 0
	binary.LittleEndian.PutUint32(fileRecords[0:4], 0)
	binary.LittleEndian.PutUint16(fileRecords[4:6], 1)
	binary.LittleEndian.PutUint16(fileRecords[6:8], 1) // Only 1 valid segment

	// File 1
	binary.LittleEndian.PutUint32(fileRecords[32:36], 1)
	binary.LittleEndian.PutUint16(fileRecords[36:38], 0xFFFF) // Inactive channel
	binary.LittleEndian.PutUint16(fileRecords[38:40], 5)

	segmentRecords := make([]byte, 2*256*SegmentLen)

	// File 0 - Slot 0 (valid segment)
	seg0 := segmentRecords[0:SegmentLen]
	seg0[0] = 1
	binary.LittleEndian.PutUint64(seg0[8:16], 1000)
	binary.LittleEndian.PutUint64(seg0[16:24], 1060)
	binary.LittleEndian.PutUint32(seg0[40:44], 100)
	binary.LittleEndian.PutUint32(seg0[44:48], 200)

	// File 0 - Slot 1 (STALE segment that should NOT be read)
	seg1 := segmentRecords[SegmentLen : 2*SegmentLen]
	seg1[0] = 1
	binary.LittleEndian.PutUint64(seg1[8:16], 5000)
	binary.LittleEndian.PutUint64(seg1[16:24], 5060)
	binary.LittleEndian.PutUint32(seg1[40:44], 300)
	binary.LittleEndian.PutUint32(seg1[44:48], 400)

	// File 1 - Slot 0 (STALE segment in inactive file that should NOT be read)
	file1Seg0 := segmentRecords[256*SegmentLen : 256*SegmentLen+SegmentLen]
	file1Seg0[0] = 1
	binary.LittleEndian.PutUint64(file1Seg0[8:16], 9000)
	binary.LittleEndian.PutUint64(file1Seg0[16:24], 9060)
	binary.LittleEndian.PutUint32(file1Seg0[40:44], 500)
	binary.LittleEndian.PutUint32(file1Seg0[44:48], 600)

	var fullIndex []byte
	fullIndex = append(fullIndex, header...)
	fullIndex = append(fullIndex, fileRecords...)
	fullIndex = append(fullIndex, segmentRecords...)

	if err := os.WriteFile(filepath.Join(datadir0, "index00.bin"), fullIndex, 0644); err != nil {
		t.Fatalf("Failed to write index00.bin: %v", err)
	}

	parser, err := NewParser(1, infoPath)
	if err != nil {
		t.Fatalf("Failed to initialize parser: %v", err)
	}

	segments, err := parser.ParseAllSegments()
	if err != nil {
		t.Fatalf("Failed to parse segments: %v", err)
	}

	if len(segments) != 1 {
		t.Fatalf("Expected exactly 1 valid segment (stale segments skipped), got %d: %+v", len(segments), segments)
	}

	if segments[0].StartTime.Unix() != 1000 || segments[0].EndTime.Unix() != 1060 {
		t.Fatalf("Unexpected segment: %+v", segments[0])
	}
}
