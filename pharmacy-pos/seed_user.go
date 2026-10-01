package main

import (
	"context"
	"log"
	"pharmacy-pos/db"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	db.Connect()
	defer db.Pool.Close()

	password := "password123"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	// Insert an Admin and a Cashier
	_, err = db.Pool.Exec(context.Background(), 
		`INSERT INTO users (employee_no, name, password_hash, role) 
		 VALUES 
		 ('EMP001', 'System Admin', $1, 'admin'),
		 ('EMP002', 'John Cashier', $1, 'cashier')
		 ON CONFLICT (employee_no) DO NOTHING`, 
		string(hash))

	if err != nil {
		log.Fatalf("Failed to seed user: %v", err)
	}

	log.Println("✅ Successfully seeded users! (Password for all is: password123)")
}