package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const UserContextKey contextKey = "user"

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

type AuthManager struct {
	jwtSecret []byte
}

func NewAuthManager(secret string) *AuthManager {
	if secret == "" {
		secret = "hikvision-site-default-secret-key-change-in-prod"
	}
	return &AuthManager{
		jwtSecret: []byte(secret),
	}
}

func (a *AuthManager) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func (a *AuthManager) CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func (a *AuthManager) GenerateToken(username string, expiry time.Duration) (string, error) {
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   username,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

func (a *AuthManager) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return a.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// Middleware creates an HTTP middleware verifying JWT from Bearer header, cookie, or query param.
func (a *AuthManager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenStr string

		// 1. Check Authorization header
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// 2. Check Cookie (useful for <video> and <img> tags)
		if tokenStr == "" {
			if cookie, err := r.Cookie("auth_token"); err == nil {
				tokenStr = cookie.Value
			}
		}

		// 3. Check Query parameter (?token=...)
		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}

		if tokenStr == "" {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		claims, err := a.ValidateToken(tokenStr)
		if err != nil {
			http.Error(w, `{"error":"Invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserFromContext(ctx context.Context) string {
	if val, ok := ctx.Value(UserContextKey).(string); ok {
		return val
	}
	return ""
}
