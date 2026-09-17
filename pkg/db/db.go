package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/models"
	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func Open(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)&_pragma=cache_size(-20000)&_pragma=temp_store(MEMORY)")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	conn.SetMaxOpenConns(25)
	conn.SetMaxIdleConns(10)
	conn.SetConnMaxLifetime(time.Hour)

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		created_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS cameras (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		path TEXT NOT NULL,
		ip TEXT NOT NULL,
		username TEXT NOT NULL,
		password TEXT NOT NULL,
		is_isapi INTEGER NOT NULL DEFAULT 0,
		enabled INTEGER NOT NULL DEFAULT 1,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS cached_segments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		camera_id INTEGER NOT NULL,
		datadir_num INTEGER NOT NULL,
		file_num INTEGER NOT NULL,
		start_offset INTEGER NOT NULL,
		end_offset INTEGER NOT NULL,
		start_time INTEGER NOT NULL,
		end_time INTEGER NOT NULL,
		record_type INTEGER NOT NULL,
		media_type TEXT NOT NULL DEFAULT 'video',
		FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_segments_cam_time 
	ON cached_segments(camera_id, media_type, start_time, end_time);

	CREATE UNIQUE INDEX IF NOT EXISTS idx_segments_unique 
	ON cached_segments(camera_id, datadir_num, file_num, start_offset, end_offset, media_type);

	CREATE TABLE IF NOT EXISTS bookmarks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		camera_id INTEGER NOT NULL,
		camera_name TEXT NOT NULL,
		title TEXT NOT NULL,
		notes TEXT NOT NULL DEFAULT '',
		start_time TEXT NOT NULL,
		end_time TEXT NOT NULL,
		datadir INTEGER NOT NULL,
		file INTEGER NOT NULL,
		video_start INTEGER NOT NULL,
		video_end INTEGER NOT NULL,
		record_type INTEGER NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE
	);
	`
	if _, err := db.conn.Exec(schema); err != nil {
		return err
	}

	// Upgrade existing database schemas if column is missing
	_, _ = db.conn.Exec("ALTER TABLE cached_segments ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video'")
	_, _ = db.conn.Exec("CREATE INDEX IF NOT EXISTS idx_segments_cam_time ON cached_segments(camera_id, media_type, start_time, end_time)")

	return nil
}

// User methods
func (db *DB) GetUserByUsername(username string) (*models.User, error) {
	var u models.User
	var createdAtStr string
	err := db.conn.QueryRow("SELECT id, username, password_hash, created_at FROM users WHERE username = ?", username).
		Scan(&u.ID, &u.Username, &u.PasswordHash, &createdAtStr)
	if err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	return &u, nil
}

func (db *DB) CountUsers() (int, error) {
	var count int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

func (db *DB) CreateUser(username, passwordHash string) error {
	_, err := db.conn.Exec(
		"INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
		username, passwordHash, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func (db *DB) UpdateUserPassword(username, newHash string) error {
	res, err := db.conn.Exec("UPDATE users SET password_hash = ? WHERE username = ?", newHash, username)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// Camera methods
func (db *DB) ListCameras() ([]models.Camera, error) {
	rows, err := db.conn.Query("SELECT id, name, path, ip, username, password, is_isapi, enabled, sort_order, created_at, updated_at FROM cameras ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cameras []models.Camera
	for rows.Next() {
		var c models.Camera
		var isISAPI, enabled int
		var createdAt, updatedAt string
		if err := rows.Scan(&c.ID, &c.Name, &c.Path, &c.IP, &c.Username, &c.Password, &isISAPI, &enabled, &c.SortOrder, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		c.IsISAPI = isISAPI != 0
		c.Enabled = enabled != 0
		c.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		c.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
		cameras = append(cameras, c)
	}
	return cameras, nil
}

func (db *DB) GetCamera(id int64) (*models.Camera, error) {
	var c models.Camera
	var isISAPI, enabled int
	var createdAt, updatedAt string
	err := db.conn.QueryRow("SELECT id, name, path, ip, username, password, is_isapi, enabled, sort_order, created_at, updated_at FROM cameras WHERE id = ?", id).
		Scan(&c.ID, &c.Name, &c.Path, &c.IP, &c.Username, &c.Password, &isISAPI, &enabled, &c.SortOrder, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	c.IsISAPI = isISAPI != 0
	c.Enabled = enabled != 0
	c.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	c.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return &c, nil
}

func (db *DB) CreateCamera(c *models.Camera) error {
	now := time.Now().UTC().Format(time.RFC3339)
	isISAPI := 0
	if c.IsISAPI {
		isISAPI = 1
	}
	enabled := 0
	if c.Enabled {
		enabled = 1
	}

	res, err := db.conn.Exec(
		"INSERT INTO cameras (name, path, ip, username, password, is_isapi, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		c.Name, c.Path, c.IP, c.Username, c.Password, isISAPI, enabled, c.SortOrder, now, now,
	)
	if err != nil {
		return err
	}
	c.ID, _ = res.LastInsertId()
	return nil
}

func (db *DB) UpdateCamera(c *models.Camera) error {
	now := time.Now().UTC().Format(time.RFC3339)
	isISAPI := 0
	if c.IsISAPI {
		isISAPI = 1
	}
	enabled := 0
	if c.Enabled {
		enabled = 1
	}

	query := "UPDATE cameras SET name=?, path=?, ip=?, username=?, is_isapi=?, enabled=?, sort_order=?, updated_at=?"
	args := []interface{}{c.Name, c.Path, c.IP, c.Username, isISAPI, enabled, c.SortOrder, now}

	if c.Password != "" {
		query += ", password=?"
		args = append(args, c.Password)
	}

	query += " WHERE id=?"
	args = append(args, c.ID)

	_, err := db.conn.Exec(query, args...)
	return err
}

func (db *DB) DeleteCamera(id int64) error {
	_, err := db.conn.Exec("DELETE FROM cameras WHERE id = ?", id)
	return err
}

func (db *DB) ReorderCameras(cameraIDs []int64) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE cameras SET sort_order = ? WHERE id = ?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for order, id := range cameraIDs {
		if _, err := stmt.Exec(order, id); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Helper function to insert segments in high-speed chunks
func insertSegmentsChunk(tx *sql.Tx, cameraID int64, chunk []models.RecordingSegment) error {
	if len(chunk) == 0 {
		return nil
	}

	query := strings.Builder{}
	query.WriteString("INSERT OR IGNORE INTO cached_segments (camera_id, datadir_num, file_num, start_offset, end_offset, start_time, end_time, record_type, media_type) VALUES ")

	args := make([]interface{}, 0, len(chunk)*9)
	for i, seg := range chunk {
		if i > 0 {
			query.WriteString(",")
		}
		query.WriteString("(?, ?, ?, ?, ?, ?, ?, ?, ?)")
		mediaType := seg.MediaType
		if mediaType == "" {
			mediaType = "video"
		}
		args = append(args, cameraID, seg.DataDirNum, seg.FileNum, seg.StartOffset, seg.EndOffset, seg.StartTime.Unix(), seg.EndTime.Unix(), seg.RecordType, mediaType)
	}

	_, err := tx.Exec(query.String(), args...)
	return err
}

// Segments cache methods
func (db *DB) SaveSegmentsBatch(cameraID int64, segments []models.RecordingSegment) error {
	if len(segments) == 0 {
		return nil
	}

	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	const batchSize = 250
	for i := 0; i < len(segments); i += batchSize {
		end := i + batchSize
		if end > len(segments) {
			end = len(segments)
		}
		if err := insertSegmentsChunk(tx, cameraID, segments[i:end]); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (db *DB) ReplaceCameraSegments(cameraID int64, segments []models.RecordingSegment) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM cached_segments WHERE camera_id = ?", cameraID); err != nil {
		return err
	}

	const batchSize = 250
	for i := 0; i < len(segments); i += batchSize {
		end := i + batchSize
		if end > len(segments) {
			end = len(segments)
		}
		if err := insertSegmentsChunk(tx, cameraID, segments[i:end]); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (db *DB) QuerySegments(cameraIDs []int64, start, end time.Time, mediaType string) ([]models.RecordingSegment, error) {
	if len(cameraIDs) == 0 {
		return nil, nil
	}

	placeholders := make([]string, len(cameraIDs))
	args := make([]interface{}, 0, len(cameraIDs)+3)
	for i, id := range cameraIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	args = append(args, start.Unix(), end.Unix())

	mediaFilter := ""
	if mediaType != "" && mediaType != "all" {
		mediaFilter = " AND media_type = ?"
		args = append(args, mediaType)
	}

	query := "SELECT id, camera_id, datadir_num, file_num, start_offset, end_offset, start_time, end_time, record_type, media_type FROM cached_segments WHERE camera_id IN (" +
		strings.Join(placeholders, ",") + ") AND end_time >= ? AND start_time <= ?" + mediaFilter + " ORDER BY start_time ASC"

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.RecordingSegment
	for rows.Next() {
		var seg models.RecordingSegment
		var startUnix, endUnix int64
		if err := rows.Scan(
			&seg.ID,
			&seg.CameraID,
			&seg.DataDirNum,
			&seg.FileNum,
			&seg.StartOffset,
			&seg.EndOffset,
			&startUnix,
			&endUnix,
			&seg.RecordType,
			&seg.MediaType,
		); err != nil {
			return nil, err
		}
		seg.StartTime = time.Unix(startUnix, 0).UTC()
		seg.EndTime = time.Unix(endUnix, 0).UTC()
		results = append(results, seg)
	}
	return results, nil
}

func (db *DB) CountSegments() (int64, error) {
	var count int64
	err := db.conn.QueryRow("SELECT COUNT(*) FROM cached_segments").Scan(&count)
	return count, err
}

func (db *DB) ClearCameraSegments(cameraID int64) error {
	_, err := db.conn.Exec("DELETE FROM cached_segments WHERE camera_id = ?", cameraID)
	return err
}

// Settings methods
func (db *DB) GetSetting(key string, defaultVal string) string {
	var val string
	err := db.conn.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	if err != nil {
		return defaultVal
	}
	return val
}

func (db *DB) SetSetting(key, val string) error {
	_, err := db.conn.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, val)
	return err
}

func (db *DB) GetRecordingDates(cameraIDs []int64, mediaType string) ([]models.RecordingDateInfo, error) {
	var query string
	var args []interface{}

	mediaFilter := ""
	if mediaType != "" && mediaType != "all" {
		mediaFilter = " AND cs.media_type = ?"
		if len(cameraIDs) > 0 {
			mediaFilter = " AND media_type = ?"
		}
	}

	if len(cameraIDs) == 0 {
		query = "SELECT strftime('%Y-%m-%d', datetime(cs.start_time, 'unixepoch')) as rec_date, COUNT(*) as count FROM cached_segments cs JOIN cameras c ON cs.camera_id = c.id WHERE c.enabled = 1 AND cs.start_time >= 1420070400" +
			mediaFilter + " GROUP BY rec_date ORDER BY rec_date DESC"
		if mediaFilter != "" {
			args = append(args, mediaType)
		}
	} else {
		placeholders := make([]string, len(cameraIDs))
		for i, id := range cameraIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		if mediaFilter != "" {
			args = append(args, mediaType)
		}
		query = "SELECT strftime('%Y-%m-%d', datetime(start_time, 'unixepoch')) as rec_date, COUNT(*) as count FROM cached_segments WHERE camera_id IN (" +
			strings.Join(placeholders, ",") + ") AND start_time >= 1420070400" + mediaFilter + " GROUP BY rec_date ORDER BY rec_date DESC"
	}

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dates []models.RecordingDateInfo
	for rows.Next() {
		var item models.RecordingDateInfo
		if err := rows.Scan(&item.Date, &item.Count); err != nil {
			return nil, err
		}
		dates = append(dates, item)
	}
	return dates, nil
}

// Bookmarks methods
func (db *DB) ListBookmarks() ([]models.Bookmark, error) {
	rows, err := db.conn.Query(`
		SELECT id, camera_id, camera_name, title, notes, start_time, end_time, datadir, file, video_start, video_end, record_type, created_at
		FROM bookmarks
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bookmarks []models.Bookmark
	for rows.Next() {
		var b models.Bookmark
		var createdAtStr string
		if err := rows.Scan(
			&b.ID,
			&b.CameraID,
			&b.CameraName,
			&b.Title,
			&b.Notes,
			&b.StartTime,
			&b.EndTime,
			&b.DataDir,
			&b.File,
			&b.VideoStart,
			&b.VideoEnd,
			&b.RecordType,
			&createdAtStr,
		); err != nil {
			return nil, err
		}
		b.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		bookmarks = append(bookmarks, b)
	}
	return bookmarks, nil
}

func (db *DB) CreateBookmark(b *models.Bookmark) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := db.conn.Exec(`
		INSERT INTO bookmarks (camera_id, camera_name, title, notes, start_time, end_time, datadir, file, video_start, video_end, record_type, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, b.CameraID, b.CameraName, b.Title, b.Notes, b.StartTime, b.EndTime, b.DataDir, b.File, b.VideoStart, b.VideoEnd, b.RecordType, now)
	if err != nil {
		return err
	}
	b.ID, _ = res.LastInsertId()
	b.CreatedAt = time.Now().UTC()
	return nil
}

func (db *DB) UpdateBookmark(id int64, title, notes string) error {
	_, err := db.conn.Exec("UPDATE bookmarks SET title = ?, notes = ? WHERE id = ?", title, notes, id)
	return err
}

func (db *DB) DeleteBookmark(id int64) error {
	_, err := db.conn.Exec("DELETE FROM bookmarks WHERE id = ?", id)
	return err
}
