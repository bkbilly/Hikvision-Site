export interface Camera {
  id: number;
  name: string;
  path: string;
  ip: string;
  username: string;
  has_password?: boolean;
  is_isapi: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecordingSegment {
  id: number;
  camera_id: number;
  start: string; // "2026-09-15 12:00:00"
  end: string;
  group: number;
  datadir: number;
  file: number;
  videoStart: number;
  videoEnd: number;
  record_type: number;
}

export interface SystemStatus {
  version: string;
  camera_count: number;
  event_count: number;
  cache_size_mb: number;
  ffmpeg_path: string;
  has_ffmpeg: boolean;
  uptime_sec: number;
}

export interface UserInfo {
  authenticated: boolean;
  username: string;
}

export interface Bookmark {
  id: number;
  camera_id: number;
  camera_name: string;
  title: string;
  notes: string;
  start_time: string;
  end_time: string;
  datadir: number;
  file: number;
  videoStart: number;
  videoEnd: number;
  record_type: number;
  created_at: string;
}

export interface RecordingDateInfo {
  date: string; // "YYYY-MM-DD"
  count: number;
}
