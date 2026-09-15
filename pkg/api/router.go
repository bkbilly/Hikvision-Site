package api

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	"github.com/bkbilly/hikvision-site/pkg/auth"
	"github.com/bkbilly/hikvision-site/pkg/db"
	"github.com/bkbilly/hikvision-site/pkg/hikvision"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Config struct {
	DB          *db.DB
	Auth        *auth.AuthManager
	Streamer    *hikvision.Streamer
	CamClient   *hikvision.CameraClient
	Crawler     *hikvision.Crawler
	StaticFS    fs.FS
	AppVersion  string
}

func SetupRouter(cfg Config) http.Handler {
	r := chi.NewRouter()

	// Global Middlewares
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS configuration for local development / mobile access
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link", "Content-Length", "Content-Range", "Accept-Ranges"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	authHandler := NewAuthHandler(cfg.DB, cfg.Auth)
	camHandler := NewCameraHandler(cfg.DB, cfg.CamClient, cfg.Crawler)
	eventHandler := NewEventHandler(cfg.DB, cfg.Crawler)
	videoHandler := NewVideoHandler(cfg.DB, cfg.Streamer)
	bookmarkHandler := NewBookmarkHandler(cfg.DB)
	wsHandler := NewWSHandler(cfg.DB, cfg.CamClient)
	sysHandler := NewSystemHandler(cfg.DB, cfg.Crawler, cfg.Streamer, cfg.AppVersion)

	// API Subrouter
	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": cfg.AppVersion})
		})

		// Public Auth
		r.Post("/auth/login", authHandler.Login)

		// Protected Routes
		r.Group(func(r chi.Router) {
			r.Use(cfg.Auth.Middleware)

			// Auth routes
			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
			r.Post("/auth/change-password", authHandler.ChangePassword)

			// Camera routes
			r.Get("/cameras", camHandler.List)
			r.Post("/cameras", camHandler.Create)
			r.Put("/cameras/reorder", camHandler.Reorder)
			r.Get("/cameras/{id}", camHandler.Get)
			r.Put("/cameras/{id}", camHandler.Update)
			r.Delete("/cameras/{id}", camHandler.Delete)
			r.Post("/cameras/test-connection", camHandler.TestConnection)
			r.Post("/cameras/discover-path", camHandler.DiscoverPath)
			r.Get("/cameras/{id}/snapshot", camHandler.Snapshot)
			r.Get("/cameras/{id}/live", camHandler.StreamLive)
			r.Get("/ws/live", wsHandler.StreamLiveWS)
			r.Get("/cameras/{id}/video", videoHandler.StreamClip)

			// Event routes
			r.Get("/events", eventHandler.GetEvents)
			r.Get("/events/dates", eventHandler.GetRecordingDates)

			// Bookmark routes
			r.Get("/bookmarks", bookmarkHandler.List)
			r.Post("/bookmarks", bookmarkHandler.Create)
			r.Put("/bookmarks/{id}", bookmarkHandler.Update)
			r.Delete("/bookmarks/{id}", bookmarkHandler.Delete)

			// System routes
			r.Get("/system/status", sysHandler.Status)
			r.Post("/system/rescan", sysHandler.Rescan)
			r.Post("/system/clear-cache", sysHandler.ClearCache)
		})
	})

	// Static Web Assets / Single Page Application fallback
	if cfg.StaticFS != nil {
		fileServer := http.FileServer(http.FS(cfg.StaticFS))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			if path == "favicon.ico" {
				if _, err := cfg.StaticFS.Open("favicon.ico"); err != nil {
					r.URL.Path = "/favicon.svg"
					fileServer.ServeHTTP(w, r)
					return
				}
			}

			// Check if file exists in static FS
			f, err := cfg.StaticFS.Open(path)
			if err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}

			// If route is not found and not an API call, serve index.html for SPA client-side routing
			if !strings.HasPrefix(r.URL.Path, "/api") {
				r.URL.Path = "/"
				fileServer.ServeHTTP(w, r)
				return
			}

			http.NotFound(w, r)
		})
	}

	return r
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
