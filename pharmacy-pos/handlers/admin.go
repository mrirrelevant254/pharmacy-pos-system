package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"pharmacy-pos/db"
	"time"

)

// InventoryItem represents a product with current stock levels
type InventoryItem struct {
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	SKU           string      `json:"sku"`
	Barcode       string      `json:"barcode"`
	Category      string      `json:"category"`
	UnitPrice     float64     `json:"unit_price"`
	TotalStock    int         `json:"total_stock"`
	ReorderLevel  int         `json:"reorder_level"`
	NeedsReorder  bool        `json:"needs_reorder"`
	Batches       []BatchInfo `json:"batches"` // 👈 Changed from LowStockBatches
}

type BatchInfo struct {
    ID          string    `json:"id"`
    BatchNo     string    `json:"batch_no"`
    Quantity    int       `json:"quantity"`
    ExpiryDate  time.Time `json:"expiry_date"`
    CostPrice   float64   `json:"cost_price"`  // 👈 ADD THIS
    IsExpiring  bool      `json:"is_expiring"`
}

// SalesAnalytics represents sales metrics
type SalesAnalytics struct {
	TotalSales        float64 `json:"total_sales"`
	TotalTransactions int     `json:"total_transactions"`
	AverageSale       float64 `json:"average_sale"`
	TodaySales        float64 `json:"today_sales"`
	TodayTransactions int     `json:"today_transactions"`
}

// TopProduct represents a top-selling product
type TopProduct struct {
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	TotalQty    int     `json:"total_qty"`
	TotalRevenue float64 `json:"total_revenue"`
}

// GetInventory returns all products with current stock levels
func GetInventory(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(context.Background(), `
		SELECT 
			p.id, p.name, p.sku, p.barcode, p.category, p.unit_price, p.reorder_level,
			COALESCE(SUM(b.quantity), 0) as total_stock
		FROM products p
		LEFT JOIN batches b ON p.id = b.product_id AND b.quantity > 0
		GROUP BY p.id
		ORDER BY p.name
	`)
	if err != nil {
		http.Error(w, "Failed to fetch inventory", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items []InventoryItem
	for rows.Next() {
		var item InventoryItem
		var totalStock int
		rows.Scan(&item.ID, &item.Name, &item.SKU, &item.Barcode, &item.Category, 
			&item.UnitPrice, &item.ReorderLevel, &totalStock)
		
		item.TotalStock = totalStock
		item.NeedsReorder = totalStock <= item.ReorderLevel

		// Get batch details for ALL items
		// Get batch details for ALL items (so the dropdown always has options)
		batchRows, err := db.Pool.Query(context.Background(), `
			SELECT id, batch_no, quantity, expiry_date, cost_price
			FROM batches 
			WHERE product_id = $1 AND quantity > 0
			ORDER BY expiry_date ASC`, item.ID)

		if err == nil {
			var batches []BatchInfo
			for batchRows.Next() {
				var batch BatchInfo
				// Scan all 5 columns in the correct order
				err := batchRows.Scan(&batch.ID, &batch.BatchNo, &batch.Quantity, &batch.ExpiryDate, &batch.CostPrice)
				if err != nil {
					log.Printf("Error scanning batch: %v", err)
					continue
				}
				batch.IsExpiring = batch.ExpiryDate.Before(time.Now().AddDate(0, 1, 0)) // Expiring within 1 month
				batches = append(batches, batch)
			}
			batchRows.Close()
			item.Batches = batches
		}

		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// GetSalesAnalytics returns sales metrics
func GetSalesAnalytics(w http.ResponseWriter, r *http.Request) {
	var analytics SalesAnalytics

	// Total sales and transactions
	err := db.Pool.QueryRow(context.Background(), `
		SELECT 
			COALESCE(SUM(total_amount), 0),
			COUNT(*)
		FROM sales
	`).Scan(&analytics.TotalSales, &analytics.TotalTransactions)
	if err != nil {
		http.Error(w, "Failed to fetch analytics", http.StatusInternalServerError)
		return
	}

	// Today's sales
	today := time.Now().Truncate(24 * time.Hour)
	err = db.Pool.QueryRow(context.Background(), `
		SELECT 
			COALESCE(SUM(total_amount), 0),
			COUNT(*)
		FROM sales
		WHERE created_at >= $1
	`, today).Scan(&analytics.TodaySales, &analytics.TodayTransactions)
	if err != nil {
		http.Error(w, "Failed to fetch today's sales", http.StatusInternalServerError)
		return
	}

	// Calculate average
	if analytics.TotalTransactions > 0 {
		analytics.AverageSale = analytics.TotalSales / float64(analytics.TotalTransactions)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analytics)
}

// GetTopProducts returns top-selling products
func GetTopProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(context.Background(), `
		SELECT 
			p.id, p.name,
			SUM(si.qty) as total_qty,
			SUM(si.qty * si.unit_price) as total_revenue
		FROM sale_items si
		JOIN products p ON si.product_id = p.id
		GROUP BY p.id, p.name
		ORDER BY total_qty DESC
		LIMIT 10
	`)
	if err != nil {
		http.Error(w, "Failed to fetch top products", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []TopProduct
	for rows.Next() {
		var product TopProduct
		rows.Scan(&product.ProductID, &product.ProductName, &product.TotalQty, &product.TotalRevenue)
		products = append(products, product)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}

// StockTakeRequest represents a stock adjustment request
type StockTakeRequest struct {
	ProductID string `json:"product_id"`
	BatchID   string `json:"batch_id"`
	NewQty    int    `json:"new_qty"`
	Reason    string `json:"reason"` // stock_take_adjustment, wastage, return
}

// UpdateStock performs a stock adjustment
func UpdateStock(w http.ResponseWriter, r *http.Request) {
	var req StockTakeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get current quantity
	var currentQty int
	err := db.Pool.QueryRow(context.Background(), `
		SELECT quantity FROM batches WHERE id = $1`, req.BatchID,
	).Scan(&currentQty)
	if err != nil {
		http.Error(w, "Batch not found", http.StatusNotFound)
		return
	}

	delta := req.NewQty - currentQty

	tx, err := db.Pool.Begin(context.Background())
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(context.Background())

	// Update batch quantity
	_, err = tx.Exec(context.Background(), `
		UPDATE batches SET quantity = $1 WHERE id = $2`,
		req.NewQty, req.BatchID,
	)
	if err != nil {
		http.Error(w, "Failed to update batch", http.StatusInternalServerError)
		return
	}

	// Log stock movement
	_, err = tx.Exec(context.Background(), `
		INSERT INTO stock_movements (product_id, batch_id, delta, reason)
		VALUES ($1, $2, $3, $4)`,
		req.ProductID, req.BatchID, delta, req.Reason,
	)
	if err != nil {
		http.Error(w, "Failed to log stock movement", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(context.Background()); err != nil {
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Stock updated successfully"})
}

// SalesAnalysis represents sales data for a period
type SalesAnalysis struct {
	Period      string        `json:"period"`
	TotalSales  float64       `json:"total_sales"`
	Transactions int          `json:"transactions"`
	TopProducts []TopProduct  `json:"top_products"`
}

// GetDailySales returns today's sales analysis
func GetDailySales(w http.ResponseWriter, r *http.Request) {
	today := time.Now().Truncate(24 * time.Hour)
	
	rows, err := db.Pool.Query(context.Background(), `
		SELECT 
			p.id, p.name,
			COALESCE(SUM(si.qty), 0) as total_qty,
			COALESCE(SUM(si.qty * si.unit_price), 0) as total_revenue
		FROM sales s
		JOIN sale_items si ON s.id = si.sale_id
		JOIN products p ON si.product_id = p.id
		WHERE s.created_at >= $1
		GROUP BY p.id, p.name
		ORDER BY total_qty DESC
	`, today)
	if err != nil {
		http.Error(w, "Failed to fetch daily sales", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []TopProduct
	for rows.Next() {
		var product TopProduct
		rows.Scan(&product.ProductID, &product.ProductName, &product.TotalQty, &product.TotalRevenue)
		products = append(products, product)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"period":       "daily",
		"top_products": products,
	})
}

// GetWeeklySales returns this week's sales analysis
func GetWeeklySales(w http.ResponseWriter, r *http.Request) {
	// Get start of week (Monday)
	now := time.Now()
	startOfWeek := now.AddDate(0, 0, -int(now.Weekday())+1).Truncate(24 * time.Hour)
	
	rows, err := db.Pool.Query(context.Background(), `
		SELECT 
			p.id, p.name,
			COALESCE(SUM(si.qty), 0) as total_qty,
			COALESCE(SUM(si.qty * si.unit_price), 0) as total_revenue
		FROM sales s
		JOIN sale_items si ON s.id = si.sale_id
		JOIN products p ON si.product_id = p.id
		WHERE s.created_at >= $1
		GROUP BY p.id, p.name
		ORDER BY total_qty DESC
		LIMIT 10
	`, startOfWeek)
	if err != nil {
		http.Error(w, "Failed to fetch weekly sales", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []TopProduct
	for rows.Next() {
		var product TopProduct
		rows.Scan(&product.ProductID, &product.ProductName, &product.TotalQty, &product.TotalRevenue)
		products = append(products, product)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"period":       "weekly",
		"top_products": products,
	})
}

// GetMonthlySales returns this month's sales analysis
func GetMonthlySales(w http.ResponseWriter, r *http.Request) {
	// Get start of month
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	
	rows, err := db.Pool.Query(context.Background(), `
		SELECT 
			p.id, p.name,
			COALESCE(SUM(si.qty), 0) as total_qty,
			COALESCE(SUM(si.qty * si.unit_price), 0) as total_revenue
		FROM sales s
		JOIN sale_items si ON s.id = si.sale_id
		JOIN products p ON si.product_id = p.id
		WHERE s.created_at >= $1
		GROUP BY p.id, p.name
		ORDER BY total_qty DESC
		LIMIT 10
	`, startOfMonth)
	if err != nil {
		http.Error(w, "Failed to fetch monthly sales", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []TopProduct
	for rows.Next() {
		var product TopProduct
		rows.Scan(&product.ProductID, &product.ProductName, &product.TotalQty, &product.TotalRevenue)
		products = append(products, product)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"period":       "monthly",
		"top_products": products,
	})
}

// AdvancedAnalytics represents the detailed report
type AdvancedAnalytics struct {
	TotalRevenue     float64             `json:"total_revenue"`
	TotalProfit      float64             `json:"total_profit"` // Estimated
	TotalTransactions int                `json:"total_transactions"`
	PaymentMethods   []PaymentMethodStat `json:"payment_methods"`
}

type PaymentMethodStat struct {
	Method string  `json:"method"`
	Count  int     `json:"count"`
	Total  float64 `json:"total"`
}

// GetAdvancedAnalytics handles /admin/analytics/advanced?start=YYYY-MM-DD&end=YYYY-MM-DD
func GetAdvancedAnalytics(w http.ResponseWriter, r *http.Request) {
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	// Default to last 30 days if no dates provided
	start := time.Now().AddDate(0, 0, -30)
	end := time.Now().Add(24 * time.Hour) // Include today fully

	if startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			start = t
		}
	}
	if endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			end = t.Add(24 * time.Hour)
		}
	}

	var analytics AdvancedAnalytics

	// 1. Get Revenue and Transactions
	err := db.Pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(total_amount), 0), COUNT(*) 
		FROM sales WHERE created_at BETWEEN $1 AND $2`, start, end).Scan(&analytics.TotalRevenue, &analytics.TotalTransactions)
	
	if err != nil {
		http.Error(w, "Failed to fetch analytics", http.StatusInternalServerError)
		return
	}

	// 2. Get Payment Method Breakdown
	rows, err := db.Pool.Query(context.Background(), `
		SELECT payment_method, COUNT(*), SUM(total_amount) 
		FROM sales WHERE created_at BETWEEN $1 AND $2 
		GROUP BY payment_method`, start, end)
	
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var stat PaymentMethodStat
			rows.Scan(&stat.Method, &stat.Count, &stat.Total)
			analytics.PaymentMethods = append(analytics.PaymentMethods, stat)
		}
	}

	// 3. Estimate Profit (Since exact batch cost per sale requires complex schema, 
	// we estimate a 40% profit margin for this report. You can adjust this logic later).
	analytics.TotalProfit = analytics.TotalRevenue * 0.40 

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analytics)
}

// TopProductRevenue represents revenue for a specific product
type TopProductRevenue struct {
	Name     string  `json:"name"`
	Revenue  float64 `json:"revenue"`
}

// GetProductRevenue handles /admin/analytics/products?start=...&end=...
func GetProductRevenue(w http.ResponseWriter, r *http.Request) {
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	start := time.Now().AddDate(0, 0, -30)
	end := time.Now().Add(24 * time.Hour)

	if startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil { start = t }
	}
	if endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil { end = t.Add(24 * time.Hour) }
	}

	rows, err := db.Pool.Query(context.Background(), `
		SELECT p.name, SUM(si.qty * si.unit_price) as revenue
		FROM sale_items si
		JOIN products p ON si.product_id = p.id
		JOIN sales s ON si.sale_id = s.id
		WHERE s.created_at BETWEEN $1 AND $2
		GROUP BY p.name
		ORDER BY revenue DESC
		LIMIT 10
	`, start, end)

	if err != nil {
		http.Error(w, "Failed to fetch product revenue", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []TopProductRevenue
	for rows.Next() {
		var p TopProductRevenue
		rows.Scan(&p.Name, &p.Revenue)
		products = append(products, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}