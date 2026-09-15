package hikvision

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/models"
)

type Crawler struct {
	db       *db.DB
	mu       sync.Mutex
	isBusy   bool
	lastScan time.Time
}

func NewCrawler(database *db.DB) *Crawler {
	return &Crawler{
		db: database,
	}
}

func (c *Crawler) StartBackgroundSync(ctx context.Context, interval time.Duration) {
	// Run initial scan in background
	go func() {
		time.Sleep(2 * time.Second)
		c.SyncAll()
	}()

	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				c.SyncAll()
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (c *Crawler) IsBusy() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.isBusy
}

func (c *Crawler) LastScanTime() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastScan
}

// SyncAll crawls all configured enabled cameras and stores discovered segments into the SQLite database.
func (c *Crawler) SyncAll() {
	c.mu.Lock()
	if c.isBusy {
		c.mu.Unlock()
		return
	}
	c.isBusy = true
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.isBusy = false
		c.lastScan = time.Now().UTC()
		c.mu.Unlock()
	}()

	cameras, err := c.db.ListCameras()
	if err != nil {
		log.Printf("[Crawler] Failed to list cameras: %v", err)
		return
	}

	for _, cam := range cameras {
		if !cam.Enabled || cam.Path == "" {
			continue
		}
		c.SyncCamera(cam)
	}
}

// SyncCamera scans a single camera's storage path.
func (c *Crawler) SyncCamera(cam models.Camera) (int, error) {
	parser, err := NewParser(cam.ID, cam.Path)
	if err != nil {
		log.Printf("[Crawler] Skipping camera %q (%s): %v", cam.Name, cam.Path, err)
		return 0, err
	}

	segments, err := parser.ParseAllSegments()
	if err != nil {
		log.Printf("[Crawler] Error parsing segments for camera %q: %v", cam.Name, err)
		return 0, err
	}

	if err := c.db.ReplaceCameraSegments(cam.ID, segments); err != nil {
		log.Printf("[Crawler] Failed to save segments for camera %q: %v", cam.Name, err)
		return 0, err
	}
	log.Printf("[Crawler] Synced %d segments for camera %q", len(segments), cam.Name)

	return len(segments), nil
}
