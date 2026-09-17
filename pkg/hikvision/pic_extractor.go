package hikvision

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// ExtractPicture extracts and parses a JPEG picture from a camera's datadir chunk file.
func (p *Parser) ExtractPicture(datadirNum int, fileNum uint32, startOffset, endOffset uint32) ([]byte, error) {
	if startOffset >= endOffset {
		return nil, fmt.Errorf("invalid offset range: start=%d end=%d", startOffset, endOffset)
	}

	length := endOffset - startOffset
	if length > 50*1024*1024 {
		return nil, fmt.Errorf("picture segment too large: %d bytes", length)
	}

	datadirPath, err := p.GetDataDirByIndex(datadirNum)
	if err != nil {
		return nil, err
	}

	// First try hivXXXXX.pic, then fallback to hivXXXXX.mp4
	picPath := filepath.Join(datadirPath, fmt.Sprintf("hiv%05d.pic", fileNum))
	f, err := os.Open(picPath)
	if err != nil {
		// Fallback to .mp4
		mp4Path := filepath.Join(datadirPath, fmt.Sprintf("hiv%05d.mp4", fileNum))
		f, err = os.Open(mp4Path)
		if err != nil {
			return nil, fmt.Errorf("failed to open picture file: %w", err)
		}
	}
	defer f.Close()

	if _, err := f.Seek(int64(startOffset), io.SeekStart); err != nil {
		return nil, fmt.Errorf("failed to seek to offset %d: %w", startOffset, err)
	}

	buf := make([]byte, length)
	if _, err := io.ReadFull(f, buf); err != nil {
		return nil, fmt.Errorf("failed to read picture slice: %w", err)
	}

	// Locate JPEG Start Of Image (0xFF, 0xD8) and End Of Image (0xFF, 0xD9)
	soiMarker := []byte{0xFF, 0xD8}
	eoiMarker := []byte{0xFF, 0xD9}

	soi := bytes.Index(buf, soiMarker)
	if soi == -1 {
		return buf, nil // Return raw bytes if SOI marker not found
	}

	eoi := bytes.LastIndex(buf[soi:], eoiMarker)
	if eoi != -1 {
		return buf[soi : soi+eoi+2], nil
	}

	return buf[soi:], nil
}
