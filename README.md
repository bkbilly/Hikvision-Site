# Hikvision Web Hub (v2.0)

A modern, high-performance, mobile-first surveillance hub and NVR web interface for **Hikvision** and **HiLook** IP cameras, NAS storage, and SD card recordings.
---

## ✨ Features

- 🚀 **Single Binary Go Architecture**: High-throughput, low-memory footprint (<25MB RAM idle), compiling the entire backend and embedded web application into a single executable.
- 📱 **Mobile-First Responsive Design**: Touch-friendly interface tailored for mobile phones, tablets, and desktop browsers with PWA capabilities.
- ⚙️ **100% UI Configurable**: Add, edit, remove, and test cameras directly in the web settings panel. No need to edit `.htaccess` or config files.
- ⏱️ **Touch-Enabled Interactive Timeline**: Smooth horizontal dragging, pinch-to-zoom (from days down to minutes), quick presets (1h, 6h, 24h, Today), and color-coded event markers.
- 🎬 **On-The-Fly Video Extraction & Remuxing**: Direct byte-range seeking from Hikvision `hiv*.mp4` recording chunks with instant FFmpeg remuxing and native HTML5 HTTP Range video streaming.
- 🔎 **Smart SQLite Indexing & Caching**: Crawls and indexes `info.bin`, `index00.bin` (binary format), and `record_db_index00` (SQLite format) for sub-millisecond timeline queries.
- 📡 **Multi-Camera Live View**: Auto-refreshing live snapshot grid with single-tap focus, ISAPI digest auth support, and full-screen monitoring.
- 🔐 **Modern Security**: Argon2 / Bcrypt password hashing, JWT authentication with HttpOnly cookies, and granular camera management.

---

## 🚀 Quick Start

### 1. Run with Docker (Recommended)

**Option A: Docker Compose**
```bash
docker compose up --build -d
```

**Option B: Docker CLI**
```bash
docker run -d \
  --name hikvision-hub \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -v /mnt/hikvision:/mnt/hikvision:ro \
  bkbillybk/hikvision_site:latest
```

Open `http://localhost:8080` in your browser.
Default credentials:
- **Username**: `admin`
- **Password**: `admin` *(You can change this in the Settings modal)*

### 2. Run Directly with Go & Node

```bash
# 1. Build frontend & backend
make build

# 2. Run standalone server
./hikvision-hub -port 8080 -data-dir ./data
```

---

## 🛠️ Configuration & Camera Setup

Everything is configured directly inside the Web UI:

1. Click the **Settings** gear icon in the top navigation bar.
2. Under the **Cameras** tab, click **Add Camera**:
   - **Name**: e.g. `Front Porch`
   - **Storage Path**: Path to your camera's `info.bin` file or folder (e.g. `/mnt/hikvision/cam1/info.bin`). Click **Check Path** to verify discovered data folders.
   - **Camera IP**: Camera local IP address (e.g. `192.168.1.160`).
   - **Username / Password**: Camera credentials.
   - **Protocol**: Check *Use ISAPI Protocol* for newer firmware and HiLook cameras.
   - Click **Test Live Connection** to verify reachability with one click.
3. Click **Save Camera**. The storage crawler will index the recordings in the background.

---

## 📁 Storage Structure Support

Hikvision Web Hub natively supports both legacy and modern Hikvision storage structures:
- **NAS Storage**: `info.bin` + `datadir0`, `datadir1`, ... + `hiv00000.mp4`
- **Legacy Index**: `index00.bin` binary structure
- **Modern SQLite Index**: `record_db_index00` database structure

---

## 🔌 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & get JWT token |
| `POST` | `/api/auth/logout` | Invalidate session cookie |
| `GET` | `/api/auth/me` | Current authenticated user info |
| `POST` | `/api/auth/change-password` | Update admin password |
| `GET` | `/api/cameras` | List configured cameras |
| `POST` | `/api/cameras` | Add new camera configuration |
| `PUT` | `/api/cameras/:id` | Update camera settings |
| `DELETE` | `/api/cameras/:id` | Remove camera configuration |
| `POST` | `/api/cameras/test-connection` | Test live camera connectivity |
| `POST` | `/api/cameras/discover-path` | Scan storage path for `info.bin` / data directories |
| `GET` | `/api/cameras/:id/snapshot` | Live JPEG snapshot proxy |
| `GET` | `/api/cameras/:id/video` | Stream video clip segment with HTTP Range support |
| `GET` | `/api/events` | Query recording events in timestamp range |
| `GET` | `/api/system/status` | System health, uptime, and cache metrics |
| `POST` | `/api/system/rescan` | Trigger background storage crawl & index |
| `POST` | `/api/system/clear-cache` | Clear temporary transcoded MP4 files |

---

## 🛠️ How It Was Created

This project originally started as an open-source PHP/Apache tool to parse Hikvision NAS/SD card recording structures and stream video segments in the browser without proprietary plugins.

### Evolution to Version 2.0
- **Unified Go Architecture**: Completely redesigned and rewritten from the ground up in **Go (Golang)**. It compiles into a single, zero-dependency standalone binary with embedded SQLite WAL storage indexing, WebSocket live previews, and on-the-fly byte-seeking FFmpeg remuxing.
- **Modern React & TypeScript UI**: Replaced legacy jQuery and vis-timeline with a modern, touch-optimized Single Page Application (SPA) built with **React**, **TypeScript**, **Tailwind CSS**, and **Lucide Icons** featuring mobile pinch-to-zoom, live camera grids, and an interactive timeline.
- **AI-Powered Pair Programming**: Designed, refactored, and built in collaboration with **Google Antigravity** (Google DeepMind's agentic AI coding assistant).

---

## 📄 License & Credits

- Created and maintained by [Vasilis Koulis (bkbilly)](https://github.com/bkbilly).
- Built with Go, React, TypeScript, and Tailwind CSS.
- Reverse engineering insights based on the Hikvision file indexing research by Dave Hope and Alexey Ozerov.

