package auth

import (
	"testing"
	"time"
)

func TestAuthManager(t *testing.T) {
	mgr := NewAuthManager("test-secret-key-12345")

	// Test password hashing and verification
	pass := "secretPassword123"
	hash, err := mgr.HashPassword(pass)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	if !mgr.CheckPassword(pass, hash) {
		t.Fatalf("Password verification failed for valid password")
	}

	if mgr.CheckPassword("wrongPassword", hash) {
		t.Fatalf("Password verification succeeded for invalid password")
	}

	// Test JWT token generation and validation
	token, err := mgr.GenerateToken("admin", time.Hour)
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	claims, err := mgr.ValidateToken(token)
	if err != nil {
		t.Fatalf("Failed to validate valid token: %v", err)
	}

	if claims.Username != "admin" {
		t.Fatalf("Expected username admin, got %s", claims.Username)
	}

	// Test expired token
	expiredToken, err := mgr.GenerateToken("admin", -time.Minute)
	if err != nil {
		t.Fatalf("Failed to generate expired token: %v", err)
	}

	_, err = mgr.ValidateToken(expiredToken)
	if err == nil {
		t.Fatalf("Expected error for expired token, got nil")
	}
}
