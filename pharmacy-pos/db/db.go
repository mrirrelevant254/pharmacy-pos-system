package db

import (
	"context"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// Pool is the global connection pool used by all handlers
var Pool *pgxpool.Pool

// Connect initializes the connection pool to Neon PostgreSQL
func Connect() error {
	// Load .env (works whether you run from the root or the pharmacy-pos folder)
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("❌ DATABASE_URL environment variable is not set")
	}

	var err error
	Pool, err = pgxpool.New(context.Background(), connStr)
	if err != nil {
		return err
	}

	if err := Pool.Ping(context.Background()); err != nil {
		return err
	}

	log.Println("✅ Successfully connected to Neon PostgreSQL")
	return nil
}