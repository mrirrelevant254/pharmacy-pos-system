package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"pharmacy-pos/db"
	"time"
)

type LabTest struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Price    float64 `json:"price"`
}

type LabOrderRequest struct {
	PatientName  string   `json:"patient_name"`
	PatientPhone string   `json:"patient_phone"`
	RequestedBy  string   `json:"requested_by"`
	TestIDs      []string `json:"test_ids"`
}

type LabOrder struct {
	ID           string    `json:"id"`
	PatientName  string    `json:"patient_name"`
	PatientPhone string    `json:"patient_phone"`
	RequestedBy  string    `json:"requested_by"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	Items        []LabItem `json:"items"`
}

type LabItem struct {
	ID       string `json:"id"`
	TestID   string `json:"test_id"`
	TestName string `json:"test_name"`
	Result   string `json:"result"`
	Status   string `json:"status"`
}

type SaveResultRequest struct {
	ItemID     string `json:"item_id"`
	Result     string `json:"result"`
	VerifiedBy string `json:"verified_by"`
}

// GetLabTests returns the catalog of available tests
func GetLabTests(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(context.Background(), "SELECT id, name, category, price FROM lab_tests ORDER BY category, name")
	if err != nil {
		http.Error(w, "Failed to fetch tests", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tests []LabTest
	for rows.Next() {
		var t LabTest
		rows.Scan(&t.ID, &t.Name, &t.Category, &t.Price)
		tests = append(tests, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tests)
}

// CreateLabOrder creates a new order with multiple tests
func CreateLabOrder(w http.ResponseWriter, r *http.Request) {
	var req LabOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	tx, err := db.Pool.Begin(context.Background())
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(context.Background())

	var orderID string
	err = tx.QueryRow(context.Background(), 
		"INSERT INTO lab_orders (patient_name, patient_phone, requested_by, status) VALUES ($1, $2, $3, 'pending') RETURNING id",
		req.PatientName, req.PatientPhone, req.RequestedBy).Scan(&orderID)
	
	if err != nil {
		http.Error(w, "Failed to create order", http.StatusInternalServerError)
		return
	}

	for _, testID := range req.TestIDs {
		_, err := tx.Exec(context.Background(), 
			"INSERT INTO lab_order_items (order_id, test_id, status) VALUES ($1, $2, 'pending')", 
			orderID, testID)
		if err != nil {
			http.Error(w, "Failed to add test to order", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(context.Background()); err != nil {
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Order created", "order_id": orderID})
}

// GetLabQueue fetches all pending and in-progress orders
func GetLabQueue(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(context.Background(), `
		SELECT lo.id, lo.patient_name, lo.patient_phone, lo.requested_by, lo.status, lo.created_at,
		       loi.id as item_id, loi.test_id, lt.name as test_name, loi.result, loi.status as item_status
		FROM lab_orders lo
		LEFT JOIN lab_order_items loi ON lo.id = loi.order_id
		LEFT JOIN lab_tests lt ON loi.test_id = lt.id
		ORDER BY lo.created_at DESC
	`)
	if err != nil {
		http.Error(w, "Failed to fetch queue", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	ordersMap := make(map[string]*LabOrder)
	var orderList []*LabOrder

	for rows.Next() {
		var orderID, pName, pPhone, reqBy, status string
		var createdAt time.Time
		var itemID, testID, testName, result, itemStatus string

		rows.Scan(&orderID, &pName, &pPhone, &reqBy, &status, &createdAt, &itemID, &testID, &testName, &result, &itemStatus)

		order, exists := ordersMap[orderID]
		if !exists {
			order = &LabOrder{
				ID: orderID, PatientName: pName, PatientPhone: pPhone, 
				RequestedBy: reqBy, Status: status, CreatedAt: createdAt,
			}
			ordersMap[orderID] = order
			orderList = append(orderList, order)
		}

		if itemID != "" {
			order.Items = append(order.Items, LabItem{
				ID: itemID, TestID: testID, TestName: testName, Result: result, Status: itemStatus,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orderList)
}

// SaveLabResult saves the result for a specific test item
func SaveLabResult(w http.ResponseWriter, r *http.Request) {
	var req SaveResultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	_, err := db.Pool.Exec(context.Background(), `
		UPDATE lab_order_items 
		SET result = $1, status = 'completed', verified_by = $2, verified_at = NOW() 
		WHERE id = $3`, req.Result, req.VerifiedBy, req.ItemID)
	
	if err != nil {
		http.Error(w, "Failed to save result", http.StatusInternalServerError)
		return
	}

	// Check if all items in the order are completed
	var orderID string
	db.Pool.QueryRow(context.Background(), "SELECT order_id FROM lab_order_items WHERE id = $1", req.ItemID).Scan(&orderID)

	var pendingCount int
	db.Pool.QueryRow(context.Background(), "SELECT COUNT(*) FROM lab_order_items WHERE order_id = $1 AND status = 'pending'", orderID).Scan(&pendingCount)

	if pendingCount == 0 {
		db.Pool.Exec(context.Background(), "UPDATE lab_orders SET status = 'completed' WHERE id = $1", orderID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Result saved"})
}