package main

import (
	"context"
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/api"
	"github.com/bkbilly/hikvision-hub/pkg/auth"
	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/hikvision"
	"github.com/bkbilly/hikvision-hub/pkg/models"
)

//go:embed web/dist/*
var embeddedWeb embed.FS

const Version = "2.0.0"

func main() {
	var (
		port        = flag.String("port", getEnv("PORT", "8080"), "HTTP port to listen on")
		dataDir     = flag.String("data-dir", getEnv("DATA_DIR", "./data"), "Directory for SQLite database and caches")
		initialUser = flag.String("initial-user", getEnv("INITIAL_USER", "admin"), "Default admin username")
		initialPass = flag.String("initial-pass", getEnv("INITIAL_PASS", "admin"), "Default admin password")
		jwtSecret   = flag.String("jwt-secret", getEnv("JWT_SECRET", "hikvision-secret-key-change-me"), "Secret for JWT signing")
	)
	flag.Parse()

	log.Printf("Starting Hikvision Web Hub v%s...", Version)

	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	dbPath := filepath.Join(*dataDir, "hikvision.db")
	cacheDir := filepath.Join(*dataDir, "cache")

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	authManager := auth.NewAuthManager(*jwtSecret)

	// Ensure default admin user exists
	userCount, err := database.CountUsers()
	if err != nil {
		log.Fatalf("Failed to query users: %v", err)
	}
	if userCount == 0 {
		hash, err := authManager.HashPassword(*initialPass)
		if err != nil {
			log.Fatalf("Failed to hash initial password: %v", err)
		}
		if err := database.CreateUser(*initialUser, hash); err != nil {
			log.Fatalf("Failed to create initial user: %v", err)
		}
		log.Printf("Created initial admin user %q (password: %q)", *initialUser, *initialPass)
	}

	// Auto-migrate legacy .htaccess cameras if database is fresh
	autoMigrateLegacyConfig(database)

	streamer, err := hikvision.NewStreamer(cacheDir)
	if err != nil {
		log.Fatalf("Failed to initialize streamer: %v", err)
	}

	camClient := hikvision.NewCameraClient()
	crawler := hikvision.NewCrawler(database)

	// Start background crawler (every 10 minutes)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	crawler.StartBackgroundSync(ctx, 10*time.Minute)

	// Start background cache auto-pruner (prunes clips >24h old or >5GB, runs every 1h)
	streamer.StartAutoPruner(ctx, 24*time.Hour, 5*1024*1024*1024, 1*time.Hour)

	// Extract static web filesystem
	var staticFS fs.FS
	subFS, err := fs.Sub(embeddedWeb, "web/dist")
	if err == nil {
		staticFS = subFS
	}

	router := api.SetupRouter(api.Config{
		DB:         database,
		Auth:       authManager,
		Streamer:   streamer,
		CamClient:  camClient,
		Crawler:    crawler,
		StaticFS:   staticFS,
		AppVersion: Version,
	})

	server := &http.Server{
		Addr:              ":" + *port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("Server listening on http://0.0.0.0:%s", *port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down server gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}
	log.Println("Server stopped")
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

func autoMigrateLegacyConfig(database *db.DB) {
	cams, err := database.ListCameras()
	if err != nil || len(cams) > 0 {
		return
	}

	htaccessData, err := os.ReadFile(".htaccess")
	if err != nil {
		return
	}

	log.Println("Discovered legacy .htaccess, auto-importing cameras...")
	lines := strings.Split(string(htaccessData), "\n")
	envMap := make(map[string]string)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "SetEnv ") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				k := parts[1]
				v := strings.Trim(strings.Join(parts[2:], " "), `"`)
				envMap[k] = v
			}
		}
	}

	camNames := strings.Split(envMap["camNames"], ",")
	camPaths := strings.Split(envMap["camPaths"], ",")
	camIPs := strings.Split(envMap["camIPs"], ",")
	camAuths := strings.Split(envMap["camAuths"], ",")
	camVersions := strings.Split(envMap["camVersions"], ",")

	for i := range camNames {
		name := strings.TrimSpace(camNames[i])
		if name == "" {
			continue
		}

		path := ""
		if i < len(camPaths) {
			path = strings.TrimSpace(camPaths[i])
		}
		ip := ""
		if i < len(camIPs) {
			ip = strings.TrimSpace(camIPs[i])
		}
		user := "admin"
		pass := "12345"
		if i < len(camAuths) {
			authPair := strings.SplitN(strings.TrimSpace(camAuths[i]), ":", 2)
			if len(authPair) == 2 {
				user = authPair[0]
				pass = authPair[1]
			}
		}
		isISAPI := false
		if i < len(camVersions) && strings.TrimSpace(camVersions[i]) == "1" {
			isISAPI = true
		}

		cam := &models.Camera{
			Name:      name,
			Path:      path,
			IP:        ip,
			Username:  user,
			Password:  pass,
			IsISAPI:   isISAPI,
			Enabled:   true,
			SortOrder: i,
		}

		if err := database.CreateCamera(cam); err != nil {
			log.Printf("Failed to import camera %s: %v", name, err)
		} else {
			log.Printf("Successfully imported camera %q (%s)", name, ip)
		}
	}
}
