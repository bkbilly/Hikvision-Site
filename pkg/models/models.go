package models

import "time"

// Camera represents an IP camera configuration.
type Camera struct {
	ID         int64     `json:"id"`
	Name       string    `json:"name"`
	Path       string    `json:"path"` // Path to info.bin or camera root directory
	IP         string    `json:"ip"`
	Username   string    `json:"username"`
	Password   string    `json:"password,omitempty"` // Omitted in public responses
	IsISAPI    bool      `json:"is_isapi"`           // true if camera uses /ISAPI/ endpoints
	Enabled    bool      `json:"enabled"`
	SortOrder  int       `json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// CameraPublic is safe for sending to clients (omits raw password or marks if configured).
type CameraPublic struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	IP        string    `json:"ip"`
	Username  string    `json:"username"`
	HasPass   bool      `json:"has_password"`
	IsISAPI   bool      `json:"is_isapi"`
	Enabled   bool      `json:"enabled"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (c *Camera) ToPublic() CameraPublic {
	return CameraPublic{
		ID:        c.ID,
		Name:      c.Name,
		Path:      c.Path,
		IP:        c.IP,
		Username:  c.Username,
		HasPass:   c.Password != "",
		IsISAPI:   c.IsISAPI,
		Enabled:   c.Enabled,
		SortOrder: c.SortOrder,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
	}
}

// RecordingSegment represents an indexed video clip event.
type RecordingSegment struct {
	ID          int64     `json:"id,omitempty"`
	CameraID    int64     `json:"camera_id"`
	DataDirNum  int       `json:"datadir"`
	FileNum     uint32    `json:"file"`
	StartOffset uint32    `json:"video_start"`
	EndOffset   uint32    `json:"video_end"`
	StartTime   time.Time `json:"start"`
	EndTime     time.Time `json:"end"`
	RecordType  uint8     `json:"record_type"`
	MediaType   string    `json:"media_type,omitempty"` // "video" (default) or "picture"
}

// User represents an administrator user.
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// SystemStatus provides runtime and storage statistics.
type SystemStatus struct {
	Version      string `json:"version"`
	CameraCount  int    `json:"camera_count"`
	EventCount   int64  `json:"event_count"`
	CacheSizeMB  int64  `json:"cache_size_mb"`
	FFmpegPath   string `json:"ffmpeg_path"`
	HasFFmpeg    bool   `json:"has_ffmpeg"`
	UptimeSec    int64  `json:"uptime_sec"`
}

// Bookmark represents a saved/starred recording clip with optional notes.
type Bookmark struct {
	ID         int64     `json:"id"`
	CameraID   int64     `json:"camera_id"`
	CameraName string    `json:"camera_name"`
	Title      string    `json:"title"`
	Notes      string    `json:"notes"`
	StartTime  string    `json:"start_time"`
	EndTime    string    `json:"end_time"`
	DataDir    int       `json:"datadir"`
	File       uint32    `json:"file"`
	VideoStart uint32    `json:"videoStart"`
	VideoEnd   uint32    `json:"videoEnd"`
	RecordType uint8     `json:"record_type"`
	CreatedAt  time.Time `json:"created_at"`
}

// RecordingDateInfo represents a calendar date containing recorded segments.
type RecordingDateInfo struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}
