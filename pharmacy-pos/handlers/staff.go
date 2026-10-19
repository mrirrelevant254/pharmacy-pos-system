package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"pharmacy-pos/db"

	"golang.org/x/crypto/bcrypt"
)

type StaffMember struct {
	ID          string `json:"id"`
	EmployeeNo  string `json:"employee_no"`
	FullName    string `json:"full_name"`
	Role        string `json:"role"`
	IsActive    bool   `json:"is_active"`
}

type CreateStaffRequest struct {
	EmployeeNo string `json:"employee_no"`
	FullName   string `json:"full_name"`
	Password   string `json:"password"`
	Role       string `json:"role"`
}

type UpdateStaffRequest struct {
	FullName string `json:"full_name"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

// GetStaff fetches all staff members
func GetStaff(w http.ResponseWriter, r *http.Request) {
	// 👇 Changed 'employees' to 'users'
	rows, err := db.Pool.Query(context.Background(), 
		"SELECT id, employee_no, full_name, role, is_active FROM users ORDER BY employee_no ASC")
	if err != nil {
		log.Printf("❌ Error fetching staff: %v", err)
		http.Error(w, "Failed to fetch staff", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var staff []StaffMember
	for rows.Next() {
		var s StaffMember
		rows.Scan(&s.ID, &s.EmployeeNo, &s.FullName, &s.Role, &s.IsActive)
		staff = append(staff, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(staff)
}

// CreateStaff adds a new staff member with a hashed password
func CreateStaff(w http.ResponseWriter, r *http.Request) {
	var req CreateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Hash the password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("❌ Error hashing password: %v", err)
		http.Error(w, "Failed to process password", http.StatusInternalServerError)
		return
	}

	//  Changed 'employees' to 'users'
	_, err = db.Pool.Exec(context.Background(), `
		INSERT INTO users (employee_no, full_name, password, role, is_active) 
		VALUES ($1, $2, $3, $4, true)`, 
		req.EmployeeNo, req.FullName, string(hashedPassword), req.Role)

	if err != nil {
		log.Printf("❌ Error creating staff: %v", err)
		http.Error(w, "Failed to create staff (Employee No might be duplicate)", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Created new staff member: %s", req.EmployeeNo)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Staff created successfully"})
}

// UpdateStaff edits staff details or toggles active status
func UpdateStaff(w http.ResponseWriter, r *http.Request) {
	staffID := r.URL.Query().Get("id")
	if staffID == "" {
		http.Error(w, "Staff ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	_, err := db.Pool.Exec(context.Background(), `
		UPDATE users SET full_name = $1, role = $2, is_active = $3 WHERE id = $4`, 
		req.FullName, req.Role, req.IsActive, staffID)

	if err != nil {
		log.Printf("❌ Error updating staff: %v", err)
		http.Error(w, "Failed to update staff", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Updated staff member: %s", staffID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Staff updated successfully"})
}