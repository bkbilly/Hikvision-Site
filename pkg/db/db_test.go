package db

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bkbilly/hikvision-site/pkg/models"
)

func TestDatabaseOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "db_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	database, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open DB: %v", err)
	}
	defer database.Close()

	// 1. User tests
	if err := database.CreateUser("admin", "hashedpass"); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	user, err := database.GetUserByUsername("admin")
	if err != nil {
		t.Fatalf("Failed to get user: %v", err)
	}
	if user.Username != "admin" || user.PasswordHash != "hashedpass" {
		t.Fatalf("User data mismatch: %+v", user)
	}

	count, err := database.CountUsers()
	if err != nil || count != 1 {
		t.Fatalf("Expected count 1, got %d (err: %v)", count, err)
	}

	// 2. Camera tests
	cam := &models.Camera{
		Name:      "Front Porch",
		Path:      "/mnt/cctv/porch/info.bin",
		IP:        "192.168.1.100",
		Username:  "admin",
		Password:  "pass123",
		IsISAPI:   true,
		Enabled:   true,
		SortOrder: 1,
	}

	if err := database.CreateCamera(cam); err != nil {
		t.Fatalf("Failed to create camera: %v", err)
	}

	if cam.ID == 0 {
		t.Fatalf("Expected non-zero camera ID after creation")
	}

	cams, err := database.ListCameras()
	if err != nil || len(cams) != 1 {
		t.Fatalf("Expected 1 camera, got %d (err: %v)", len(cams), err)
	}

	cam2 := &models.Camera{
		Name:      "Backyard",
		Path:      "/mnt/cctv/back/info.bin",
		IP:        "192.168.1.101",
		Username:  "admin",
		SortOrder: 2,
	}
	if err := database.CreateCamera(cam2); err != nil {
		t.Fatalf("Failed to create camera 2: %v", err)
	}

	// Test reordering: swap order so cam2 comes first
	if err := database.ReorderCameras([]int64{cam2.ID, cam.ID}); err != nil {
		t.Fatalf("Failed to reorder cameras: %v", err)
	}
	camsAfterReorder, err := database.ListCameras()
	if err != nil || len(camsAfterReorder) != 2 {
		t.Fatalf("Expected 2 cameras after reorder, got %d", len(camsAfterReorder))
	}
	if camsAfterReorder[0].ID != cam2.ID || camsAfterReorder[1].ID != cam.ID {
		t.Fatalf("Reorder failed: expected [%d, %d], got [%d, %d]", cam2.ID, cam.ID, camsAfterReorder[0].ID, camsAfterReorder[1].ID)
	}

	// 3. Segment cache tests
	now := time.Now().UTC().Truncate(time.Second)
	segments := []models.RecordingSegment{
		{
			CameraID:    cam.ID,
			DataDirNum:  0,
			FileNum:     0,
			StartOffset: 1000,
			EndOffset:   50000,
			StartTime:   now.Add(-2 * time.Hour),
			EndTime:     now.Add(-1 * time.Hour),
			RecordType:  1,
		},
		{
			CameraID:    cam.ID,
			DataDirNum:  0,
			FileNum:     1,
			StartOffset: 1000,
			EndOffset:   40000,
			StartTime:   now.Add(-30 * time.Minute),
			EndTime:     now.Add(-10 * time.Minute),
			RecordType:  1,
		},
	}

	if err := database.SaveSegmentsBatch(cam.ID, segments); err != nil {
		t.Fatalf("Failed to save segment batch: %v", err)
	}

	segCount, err := database.CountSegments()
	if err != nil || segCount != 2 {
		t.Fatalf("Expected 2 segments, got %d (err: %v)", segCount, err)
	}

	// Query segments in time window
	queried, err := database.QuerySegments([]int64{cam.ID}, now.Add(-3*time.Hour), now)
	if err != nil || len(queried) != 2 {
		t.Fatalf("Expected 2 queried segments, got %d (err: %v)", len(queried), err)
	}

	// Test ReplaceCameraSegments (clean replace)
	replacementSegs := []models.RecordingSegment{
		{
			CameraID:    cam.ID,
			DataDirNum:  0,
			FileNum:     2,
			StartOffset: 2000,
			EndOffset:   60000,
			StartTime:   now.Add(-5 * time.Minute),
			EndTime:     now,
			RecordType:  1,
		},
	}
	if err := database.ReplaceCameraSegments(cam.ID, replacementSegs); err != nil {
		t.Fatalf("Failed to replace camera segments: %v", err)
	}

	segCount, err = database.CountSegments()
	if err != nil || segCount != 1 {
		t.Fatalf("Expected 1 segment after replace, got %d (err: %v)", segCount, err)
	}

	// 4. Settings tests
	if err := database.SetSetting("theme", "dark"); err != nil {
		t.Fatalf("Failed to set setting: %v", err)
	}
	if val := database.GetSetting("theme", "light"); val != "dark" {
		t.Fatalf("Expected setting 'dark', got %s", val)
	}

	// 5. Recording Dates (Heatmap) tests
	recDates, err := database.GetRecordingDates([]int64{cam.ID})
	if err != nil || len(recDates) == 0 {
		t.Fatalf("Expected recording dates, got %v (err: %v)", recDates, err)
	}

	// 6. Bookmarks tests
	bm := &models.Bookmark{
		CameraID:   cam.ID,
		CameraName: cam.Name,
		Title:      "Test Package Delivered",
		Notes:      "White van left box",
		StartTime:  "2026-09-15 14:00:00",
		EndTime:    "2026-09-15 14:15:00",
		DataDir:    0,
		File:       2,
		VideoStart: 2000,
		VideoEnd:   60000,
		RecordType: 1,
	}
	if err := database.CreateBookmark(bm); err != nil {
		t.Fatalf("Failed to create bookmark: %v", err)
	}
	if bm.ID == 0 {
		t.Fatalf("Expected non-zero bookmark ID")
	}

	bms, err := database.ListBookmarks()
	if err != nil || len(bms) != 1 {
		t.Fatalf("Expected 1 bookmark, got %d (err: %v)", len(bms), err)
	}

	if err := database.UpdateBookmark(bm.ID, "Updated Title", "Updated Notes"); err != nil {
		t.Fatalf("Failed to update bookmark: %v", err)
	}

	if err := database.DeleteBookmark(bm.ID); err != nil {
		t.Fatalf("Failed to delete bookmark: %v", err)
	}
	bmsAfter, _ := database.ListBookmarks()
	if len(bmsAfter) != 0 {
		t.Fatalf("Expected 0 bookmarks after delete, got %d", len(bmsAfter))
	}
}
