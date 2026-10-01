package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"pharmacy-pos/db"
	"pharmacy-pos/middleware"
	"time"

	"github.com/go-chi/chi/v5"
)

type ProductRequest struct {
	Name                  string  `json:"name"`
	SKU                   string  `json:"sku"`
	Barcode               string  `json:"barcode"`
	Category              string  `json:"category"`
	ReorderLevel          int     `json:"reorder_level"`
	ReorderQty            int     `json:"reorder_qty"`
	UnitPrice             float64 `json:"unit_price"`
	RequiresPrescription  bool    `json:"requires_prescription"`
}

type BatchRequest struct {
	ProductID  string  `json:"product_id"`
	BatchNo    string  `json:"batch_no"`
	Quantity   int     `json:"quantity"`
	ExpiryDate string  `json:"expiry_date"` // Format: "2025-12-31"
	CostPrice  float64 `json:"cost_price"`
}

// CreateProduct adds a new product to the catalog
func CreateProduct(w http.ResponseWriter, r *http.Request) {
	var req ProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var productID string
	err := db.Pool.QueryRow(context.Background(), `
		INSERT INTO products (name, sku, barcode, category, reorder_level, reorder_qty, unit_price, requires_prescription)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		req.Name, req.SKU, req.Barcode, req.Category, req.ReorderLevel, req.ReorderQty, req.UnitPrice, req.RequiresPrescription,
	).Scan(&productID)

	if err != nil {
		http.Error(w, "Failed to create product (SKU or Barcode might be duplicate)", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": productID, "message": "Product created successfully"})
}

// ReceiveStock adds a new batch and logs the stock movement
func ReceiveStock(w http.ResponseWriter, r *http.Request) {
	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get the logged-in user from the context (injected by AuthMiddleware)
	user, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	expiryDate, err := time.Parse("2006-01-02", req.ExpiryDate)
	if err != nil {
		http.Error(w, "Invalid expiry_date format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Start a transaction to ensure batch creation and movement logging are atomic
	tx, err := db.Pool.Begin(context.Background())
	if err != nil {
		http.Error(w, "Database transaction failed", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(context.Background())

	var batchID string
	err = tx.QueryRow(context.Background(), `
		INSERT INTO batches (product_id, batch_no, quantity, expiry_date, cost_price)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		req.ProductID, req.BatchNo, req.Quantity, expiryDate, req.CostPrice,
	).Scan(&batchID)

	if err != nil {
		http.Error(w, "Failed to create batch", http.StatusInternalServerError)
		return
	}

	// Log the stock movement
	_, err = tx.Exec(context.Background(), `
		INSERT INTO stock_movements (product_id, batch_id, delta, reason, created_by)
		VALUES ($1, $2, $3, 'receiving', $4)`,
		req.ProductID, batchID, req.Quantity, user.UserID,
	)

	if err != nil {
		http.Error(w, "Failed to log stock movement", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(context.Background()); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": batchID, "message": "Stock received successfully"})
}

type SaleItemRequest struct {
	ProductID string `json:"product_id"`
	Qty       int    `json:"qty"`
}

type SaleRequest struct {
	Items         []SaleItemRequest `json:"items"`
	PaymentMethod string            `json:"payment_method"`
	PatientID     *string           `json:"patient_id"` // Optional
}

// ProcessSale handles the POS checkout with strict FEFO logic
func ProcessSale(w http.ResponseWriter, r *http.Request) {
	var req SaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user, _ := middleware.GetUserFromContext(r.Context())

	// Start a database transaction. If anything fails, we roll back everything.
	tx, err := db.Pool.Begin(context.Background())
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(context.Background())

	var totalAmount float64 = 0

	// 1. Create the Sale Header first to get the sale_id
	var saleID string
	err = tx.QueryRow(context.Background(), `
		INSERT INTO sales (cashier_id, patient_id, payment_method, total_amount)
		VALUES ($1, $2, $3, 0) RETURNING id`,
		user.UserID, req.PatientID, req.PaymentMethod,
	).Scan(&saleID)
	if err != nil {
		http.Error(w, "Failed to create sale record", http.StatusInternalServerError)
		return
	}

	// 2. Process each item in the cart
	for _, item := range req.Items {
		// Get product details (specifically the selling price)
		var productID string
		var unitPrice float64
		err = tx.QueryRow(context.Background(), `
			SELECT id, unit_price FROM products WHERE id = $1`, item.ProductID,
		).Scan(&productID, &unitPrice)
		if err != nil {
			http.Error(w, "Product not found: "+item.ProductID, http.StatusBadRequest)
			return
		}

		totalAmount += unitPrice * float64(item.Qty)
		qtyNeeded := item.Qty

		// FEFO LOGIC: Fetch batches ordered by earliest expiry date, with available stock
		rows, err := tx.Query(context.Background(), `
			SELECT id, quantity FROM batches 
			WHERE product_id = $1 AND quantity > 0 
			ORDER BY expiry_date ASC`, productID,
		)
		if err != nil {
			http.Error(w, "Failed to query batches", http.StatusInternalServerError)
			return
		}

		type BatchDeduction struct {
			BatchID string
			Qty     int
		}
		var deductions []BatchDeduction

		// Calculate how much to take from each batch
		for rows.Next() {
			if qtyNeeded <= 0 {
				break
			}
			var batchID string
			var availableQty int
			rows.Scan(&batchID, &availableQty)

			deductQty := 0
			if availableQty >= qtyNeeded {
				deductQty = qtyNeeded
				qtyNeeded = 0
			} else {
				deductQty = availableQty
				qtyNeeded -= availableQty
			}
			deductions = append(deductions, BatchDeduction{BatchID: batchID, Qty: deductQty})
		}
		rows.Close()

		// If we still need more quantity, we don't have enough stock!
		if qtyNeeded > 0 {
			http.Error(w, "Insufficient stock for product "+productID, http.StatusBadRequest)
			return
		}

		// Apply the deductions to the database
		for _, ded := range deductions {
			// Deduct from batch
			_, err = tx.Exec(context.Background(), `
				UPDATE batches SET quantity = quantity - $1 WHERE id = $2`,
				ded.Qty, ded.BatchID,
			)
			if err != nil {
				http.Error(w, "Failed to update batch", http.StatusInternalServerError)
				return
			}

			// Record the sale item
			_, err = tx.Exec(context.Background(), `
				INSERT INTO sale_items (sale_id, product_id, batch_id, qty, unit_price)
				VALUES ($1, $2, $3, $4, $5)`,
				saleID, productID, ded.BatchID, ded.Qty, unitPrice,
			)
			if err != nil {
				http.Error(w, "Failed to insert sale item", http.StatusInternalServerError)
				return
			}

			// Log the negative stock movement
			_, err = tx.Exec(context.Background(), `
				INSERT INTO stock_movements (product_id, batch_id, delta, reason, ref_type, ref_id, created_by)
				VALUES ($1, $2, $3, 'sale', 'sale_id', $4, $5)`,
				productID, ded.BatchID, -ded.Qty, saleID, user.UserID,
			)
			if err != nil {
				http.Error(w, "Failed to log stock movement", http.StatusInternalServerError)
				return
			}
		}
	}

	// 3. Update the total amount on the sale header
	_, err = tx.Exec(context.Background(), `
		UPDATE sales SET total_amount = $1 WHERE id = $2`,
		totalAmount, saleID,
	)
	if err != nil {
		http.Error(w, "Failed to update sale total", http.StatusInternalServerError)
		return
	}

	// 4. Commit the transaction!
	if err := tx.Commit(context.Background()); err != nil {
		http.Error(w, "Failed to commit sale", http.StatusInternalServerError)
		return
	}

	logAudit(&user.UserID, "sale_completed", "Sale ID: "+saleID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sale_id":      saleID,
		"total_amount": totalAmount,
		"message":      "Sale processed successfully using FEFO logic",
	})
}

// GetProducts returns all active products (for search and catalog)
func GetProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(context.Background(), `
		SELECT id, name, sku, barcode, category, unit_price, requires_prescription 
		FROM products`) // Assuming we might add active later
	if err != nil {
		http.Error(w, "Failed to fetch products", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []map[string]interface{}
	for rows.Next() {
		var id, name, sku, barcode, category string
		var unitPrice float64
		var requiresPrescription bool
		
		rows.Scan(&id, &name, &sku, &barcode, &category, &unitPrice, &requiresPrescription)
		products = append(products, map[string]interface{}{
			"id": id, "name": name, "sku": sku, "barcode": barcode, 
			"category": category, "unit_price": unitPrice, "requires_prescription": requiresPrescription,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}

// GetProductByBarcode looks up a specific product by its barcode
func GetProductByBarcode(w http.ResponseWriter, r *http.Request) {
	barcode := chi.URLParam(r, "code")
	
	var id, name, sku, category string
	var unitPrice float64
	var requiresPrescription bool

	err := db.Pool.QueryRow(context.Background(), `
		SELECT id, name, sku, category, unit_price, requires_prescription 
		FROM products WHERE barcode = $1`, barcode,
	).Scan(&id, &name, &sku, &category, &unitPrice, &requiresPrescription)

	if err != nil {
		http.Error(w, "Product not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id": id, "name": name, "sku": sku, "barcode": barcode, 
		"category": category, "unit_price": unitPrice, "requires_prescription": requiresPrescription,
	})
}