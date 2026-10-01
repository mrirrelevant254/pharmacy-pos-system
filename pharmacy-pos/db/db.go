package db

import (
	"context"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the global connection pool to our PostgreSQL database
var Pool *pgxpool.Pool

// Connect initializes the database connection pool
func Connect() {
	// Use the environment variable if set, otherwise fallback to our local pgAdmin setup
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:secret@localhost:5432/pharmacy_pos?sslmode=disable"
	}

	var err error
	Pool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("❌ Unable to connect to database: %v\n", err)
	}

	// Ping the database to verify the connection
	err = Pool.Ping(context.Background())
	if err != nil {
		log.Fatalf("❌ Unable to ping database: %v\n", err)
	}

	log.Println("✅ Successfully connected to PostgreSQL")
}