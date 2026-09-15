package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/auth"
	"github.com/bkbilly/hikvision-hub/pkg/db"
)

type AuthHandler struct {
	db   *db.DB
	auth *auth.AuthManager
}

func NewAuthHandler(db *db.DB, auth *auth.AuthManager) *AuthHandler {
	return &AuthHandler{db: db, auth: auth}
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.db.GetUserByUsername(req.Username)
	if err != nil {
		writeJSONError(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	if !h.auth.CheckPassword(req.Password, user.PasswordHash) {
		writeJSONError(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	token, err := h.auth.GenerateToken(user.Username, 30*24*time.Hour)
	if err != nil {
		writeJSONError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set HttpOnly cookie for seamless media streaming
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(30 * 24 * time.Hour),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, LoginResponse{
		Token:    token,
		Username: user.Username,
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	username := auth.GetUserFromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"authenticated": true,
		"username":      username,
	})
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	username := auth.GetUserFromContext(r.Context())
	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 4 {
		writeJSONError(w, "New password must be at least 4 characters", http.StatusBadRequest)
		return
	}

	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		writeJSONError(w, "User not found", http.StatusNotFound)
		return
	}

	if !h.auth.CheckPassword(req.CurrentPassword, user.PasswordHash) {
		writeJSONError(w, "Current password is incorrect", http.StatusUnauthorized)
		return
	}

	newHash, err := h.auth.HashPassword(req.NewPassword)
	if err != nil {
		writeJSONError(w, "Failed to hash new password", http.StatusInternalServerError)
		return
	}

	if err := h.db.UpdateUserPassword(username, newHash); err != nil {
		writeJSONError(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
