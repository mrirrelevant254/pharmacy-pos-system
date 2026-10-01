package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"pharmacy-pos/db"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// JWT Secret (In production, load this from an environment variable!)
var jwtSecret = []byte("super_secret_key_change_in_production")

type LoginRequest struct {
	EmployeeNo string `json:"employee_no"`
	Password   string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	Role  string `json:"role"`
	Name  string `json:"name"`
}

func Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var userID, name, role, passwordHash string
	err := db.Pool.QueryRow(context.Background(), 
		"SELECT id, name, role, password_hash FROM users WHERE employee_no = $1 AND active = true", 
		req.EmployeeNo).Scan(&userID, &name, &role, &passwordHash)

	if err != nil {
		logAudit(nil, "login_failed", "Invalid employee number")
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Compare the provided password with the stored hash
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		logAudit(&userID, "login_failed", "Wrong password")
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Generate JWT
	token, err := generateJWT(userID, role, "password")
	if err != nil {
		http.Error(w, "Could not generate token", http.StatusInternalServerError)
		return
	}

	logAudit(&userID, "login_success", "Logged in via password")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(LoginResponse{
		Token: token,
		Role:  role,
		Name:  name,
	})
}

func generateJWT(userID, role, method string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"role":    role,
		"method":  method,
		"exp":     time.Now().Add(time.Hour * 24).Unix(), // 24-hour expiry
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// Helper to log to audit_log
func logAudit(userID *string, action, details string) {
	var uid interface{} = nil
	if userID != nil {
		uid = *userID
	}
	// We use a background context so the audit log doesn't fail the main request if DB is slow
	go func() {
		_, err := db.Pool.Exec(context.Background(), 
			"INSERT INTO audit_log (user_id, action, metadata) VALUES ($1, $2, $3)", 
			uid, action, map[string]string{"details": details})
		if err != nil {
			log.Printf("Failed to write audit log: %v", err)
		}
	}()
}