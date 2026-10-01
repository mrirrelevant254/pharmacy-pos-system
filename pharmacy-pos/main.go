package main

import (
	"log"
	"net/http"
	"pharmacy-pos/db"
	"pharmacy-pos/handlers"
	"pharmacy-pos/middleware"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// 1. Connect to the Database
	db.Connect()
	defer db.Pool.Close()

	// 2. Setup the Chi Router
	r := chi.NewRouter()
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	// 3. Enable CORS for React frontend
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "https://*.ngrok-free.app"}, // Added ngrok for M-Pesa callbacks
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// 4. Public Routes (No Auth Required)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})
	r.Post("/api/auth/login", handlers.Login)
	
	// M-Pesa Callback (Safaricom servers don't send JWT tokens, so this MUST be public)
	r.Post("/api/mpesa/callback", handlers.MpesaCallback)

	// 5. Protected Routes (Auth Required)
	r.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware)

		// Pharmacy Routes
		r.Route("/api/pharmacy", func(r chi.Router) {
			r.Use(middleware.RequireRole("cashier", "pharmacist", "admin"))
			r.Get("/products", handlers.GetProducts)
			r.Get("/products/barcode/{code}", handlers.GetProductByBarcode)
			r.Post("/products", handlers.CreateProduct)
			r.Post("/batches", handlers.ReceiveStock)
			r.Post("/sale", handlers.ProcessSale)
			r.Get("/pending-consultations", handlers.GetPendingConsultations)
			r.Post("/dispense", handlers.MarkConsultationDispensed)
		})

		// Lab Routes
		r.Route("/api/lab", func(r chi.Router) {
			r.Use(middleware.RequireRole("lab_tech", "doctor", "admin"))
			r.Get("/tests", handlers.GetLabTests)
			r.Post("/orders", handlers.CreateLabOrder)
			r.Get("/queue", handlers.GetLabQueue)
			r.Post("/results", handlers.SaveLabResult)
		})

				// Doctor/Consultation Routes
		r.Route("/api/doctor", func(r chi.Router) {
			r.Use(middleware.RequireRole("doctor", "admin"))
			r.Get("/patients", handlers.SearchPatients)
			r.Post("/consultations", handlers.CreateConsultation)
			r.Get("/history", handlers.GetPatientHistory)
		})

		// Admin Routes
		r.Route("/api/admin", func(r chi.Router) {
			r.Use(middleware.RequireRole("admin"))
			r.Get("/inventory", handlers.GetInventory)
			r.Get("/analytics", handlers.GetSalesAnalytics)
			r.Get("/top-products", handlers.GetTopProducts)
			r.Post("/stock-update", handlers.UpdateStock)
			r.Get("/analytics/advanced", handlers.GetAdvancedAnalytics)
			r.Get("/analytics/products", handlers.GetProductRevenue)
		})

		// M-Pesa Initiation (Protected: Only logged-in cashiers can trigger STK Push)
		r.Post("/api/mpesa/stkpush", handlers.InitiateSTKPush)
	})

	// 6. Start Server
	log.Println(" Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}