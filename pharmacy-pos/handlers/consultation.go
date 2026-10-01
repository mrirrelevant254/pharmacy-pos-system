package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"pharmacy-pos/db"
	"time"
)

// --- Structs ---

type Patient struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	DOB     string `json:"dob"`
	Gender  string `json:"gender"`
}

type ConsultationRequest struct {
	PatientID     string                `json:"patient_id"`
	PatientName   string                `json:"patient_name"`
	PatientPhone  string                `json:"patient_phone"`
	DoctorName    string                `json:"doctor_name"`
	Vitals        string                `json:"vitals"`
	Symptoms      string                `json:"symptoms"`
	Diagnosis     string                `json:"diagnosis"`
	Notes         string                `json:"notes"`
	Prescriptions []PrescriptionRequest `json:"prescriptions"`
}

type PrescriptionRequest struct {
	ProductID    string `json:"product_id"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Instructions string `json:"instructions"`
	Quantity     int    `json:"quantity"`
}

type PatientHistory struct {
	Consultations []ConsultationDetail `json:"consultations"`
	LabOrders     []LabOrder           `json:"lab_orders"`
}

type ConsultationDetail struct {
	ID            string               `json:"id"`
	Doctor        string               `json:"doctor"`
	Vitals        string               `json:"vitals"`
	Diagnosis     string               `json:"diagnosis"`
	Date          time.Time            `json:"date"`
	Prescriptions []PrescriptionDetail `json:"prescriptions"`
	Quantity    int    `json:"quantity"`
}

type PrescriptionDetail struct {
	ProductName string `json:"product_name"`
	Dosage      string `json:"dosage"`
	Frequency   string `json:"frequency"`
	Duration    string `json:"duration"`
}

type PendingConsultation struct {
	ID            string               `json:"id"`
	PatientName   string               `json:"patient_name"`
	DoctorName    string               `json:"doctor_name"`
	Diagnosis     string               `json:"diagnosis"`
	CreatedAt     time.Time            `json:"created_at"`
	Prescriptions []PrescriptionDetail `json:"prescriptions"`
}

// --- Handlers ---

// SearchPatients finds patients by name or phone
func SearchPatients(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		json.NewEncoder(w).Encode([]Patient{})
		return
	}

	rows, err := db.Pool.Query(context.Background(), 
		"SELECT id, full_name as name, phone, dob::text, gender FROM patients WHERE full_name ILIKE $1 OR phone LIKE $2 LIMIT 20", 
		"%"+query+"%", "%"+query+"%")
	if err != nil {
		log.Printf("❌ SearchPatients DB Error: %v", err)
		http.Error(w, "Failed to search patients", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var patients []Patient
	for rows.Next() {
		var p Patient
		rows.Scan(&p.ID, &p.Name, &p.Phone, &p.DOB, &p.Gender)
		patients = append(patients, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(patients)
}

// CreateConsultation saves the consultation and prescriptions
func CreateConsultation(w http.ResponseWriter, r *http.Request) {
	var req ConsultationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf(" Decode Error: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("📋 Creating consultation for: %s", req.PatientName)

	tx, err := db.Pool.Begin(context.Background())
	if err != nil {
		log.Printf("❌ DB Transaction Error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(context.Background())

	patientID := req.PatientID

	// 1. Create Patient if ID is empty
	if patientID == "" && req.PatientName != "" {
		log.Printf(" Creating new patient: %s", req.PatientName)
		
		err := tx.QueryRow(context.Background(), 
			"INSERT INTO patients (full_name, phone) VALUES ($1, $2) RETURNING id", 
			req.PatientName, req.PatientPhone).Scan(&patientID)
		
		if err != nil {
			log.Printf("❌ Failed to create patient: %v", err)
			http.Error(w, "Failed to create patient: "+err.Error(), http.StatusInternalServerError)
			return
		}
		log.Printf("✅ Patient created with ID: %s", patientID)
	}

	if patientID == "" {
		http.Error(w, "Patient ID is missing", http.StatusBadRequest)
		return
	}

	// 2. Create Consultation
	var consultationID string
	err = tx.QueryRow(context.Background(), `
		INSERT INTO consultations (patient_id, doctor_name, vitals, symptoms, diagnosis, notes, status) 
		VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
		patientID, req.DoctorName, req.Vitals, req.Symptoms, req.Diagnosis, req.Notes).Scan(&consultationID)
	
	if err != nil {
		log.Printf("❌ Failed to create consultation: %v", err)
		http.Error(w, "Failed to create consultation: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Create Prescriptions
	for _, p := range req.Prescriptions {
		if p.ProductID != "" {
			_, err := tx.Exec(context.Background(), `
				INSERT INTO prescriptions (consultation_id, product_id, dosage, frequency, duration, instructions) 
				VALUES ($1, $2, $3, $4, $5, $6)`,
				consultationID, p.ProductID, p.Dosage, p.Frequency, p.Duration, p.Instructions)
			if err != nil {
				log.Printf("❌ Failed to save prescription: %v", err)
				http.Error(w, "Failed to save prescription: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(context.Background()); err != nil {
		log.Printf("❌ Commit Error: %v", err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Consultation saved successfully: %s", consultationID)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Consultation saved", "consultation_id": consultationID})
}

// GetPatientHistory fetches all consultations and lab orders for a patient
func GetPatientHistory(w http.ResponseWriter, r *http.Request) {
	patientID := r.URL.Query().Get("patient_id")
	if patientID == "" {
		http.Error(w, "patient_id is required", http.StatusBadRequest)
		return
	}

	log.Printf("📋 Fetching history for patient: %s", patientID)

	var history PatientHistory

	// 1. Get Consultations & Prescriptions
	cRows, err := db.Pool.Query(context.Background(), `
		SELECT c.id, c.doctor_name, c.vitals, c.diagnosis, c.created_at,
		       p.dosage, p.frequency, p.duration, pr.name as product_name
		FROM consultations c
		LEFT JOIN prescriptions p ON c.id = p.consultation_id
		LEFT JOIN products pr ON p.product_id = pr.id
		WHERE c.patient_id = $1
		ORDER BY c.created_at DESC`, patientID)
	
	if err != nil {
		log.Printf(" Error fetching consultations: %v", err)
	} else {
		defer cRows.Close()
		consultMap := make(map[string]*ConsultationDetail)
		
		for cRows.Next() {
			var cID, doctor, vitals, diagnosis string
			var date time.Time
			
			// 👇 MAKE ALL PRESCRIPTION COLUMNS POINTERS TO HANDLE NULL SAFELY 👇
			var dosage, freq, dur, pName *string 
			
			err := cRows.Scan(&cID, &doctor, &vitals, &diagnosis, &date, &dosage, &freq, &dur, &pName)
			if err != nil {
				log.Printf("⚠️ Error scanning row: %v", err)
				continue
			}
			
			if _, exists := consultMap[cID]; !exists {
				consultMap[cID] = &ConsultationDetail{
					ID: cID, Doctor: doctor, Vitals: vitals, 
					Diagnosis: diagnosis, Date: date,
					Prescriptions: []PrescriptionDetail{},
				}
				history.Consultations = append(history.Consultations, *consultMap[cID])
			}
			
			// Add prescription if it exists (pName is not null)
			if pName != nil && *pName != "" {
				idx := len(history.Consultations) - 1
				
				// Safely dereference pointers, defaulting to empty string if NULL
				d := ""
				if dosage != nil { d = *dosage }
				f := ""
				if freq != nil { f = *freq }
				durStr := ""
				if dur != nil { durStr = *dur }

				history.Consultations[idx].Prescriptions = append(history.Consultations[idx].Prescriptions, PrescriptionDetail{
					ProductName: *pName, Dosage: d, Frequency: f, Duration: durStr,
				})
			}
		}
	}

	// 2. Get Patient's phone number to match lab orders
	var patientPhone string
	err = db.Pool.QueryRow(context.Background(), "SELECT phone FROM patients WHERE id = $1", patientID).Scan(&patientPhone)
	if err != nil {
		log.Printf("⚠️ Could not fetch patient phone: %v", err)
	}

	// 3. Get Lab Orders (match by phone)
	if patientPhone != "" {
		lRows, err := db.Pool.Query(context.Background(), `
			SELECT lo.id, lo.patient_name, lo.patient_phone, lo.requested_by, lo.status, lo.created_at
			FROM lab_orders lo
			WHERE lo.patient_phone = $1
			ORDER BY lo.created_at DESC`, patientPhone)
		
		if err != nil {
			log.Printf("⚠️ Error fetching lab orders: %v", err)
		} else {
			defer lRows.Close()
			for lRows.Next() {
				var lo LabOrder
				var pName, pPhone *string
				err := lRows.Scan(&lo.ID, &pName, &pPhone, &lo.RequestedBy, &lo.Status, &lo.CreatedAt)
				if err == nil {
					if pName != nil {
						lo.PatientName = *pName
					}
					if pPhone != nil {
						lo.PatientPhone = *pPhone
					}
					history.LabOrders = append(history.LabOrders, lo)
				}
			}
		}
	}

	log.Printf("✅ Found %d consultations and %d lab orders", len(history.Consultations), len(history.LabOrders))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

// GetPendingConsultations fetches all consultations that haven't been dispensed yet
func GetPendingConsultations(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Pool.Query(context.Background(), `
		SELECT c.id, p.full_name as patient_name, c.doctor_name, c.diagnosis, c.created_at,
		       pr.name as product_name, prs.dosage, prs.frequency, prs.duration
		FROM consultations c
		JOIN patients p ON c.patient_id = p.id
		LEFT JOIN prescriptions prs ON c.id = prs.consultation_id
		LEFT JOIN products pr ON prs.product_id = pr.id
		WHERE c.status = 'pending'
		ORDER BY c.created_at DESC
	`)
	if err != nil {
		log.Printf("❌ Error fetching pending consultations: %v", err)
		http.Error(w, "Failed to fetch queue", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	consultMap := make(map[string]*PendingConsultation)
	var queue []*PendingConsultation

	for rows.Next() {
		var cID, pName, docName, diagnosis string
		var date time.Time
		var prodName, dosage, freq, dur *string

		err := rows.Scan(&cID, &pName, &docName, &diagnosis, &date, &prodName, &dosage, &freq, &dur)
		if err != nil {
			log.Printf("⚠️ Error scanning row: %v", err)
			continue
		}

		if _, exists := consultMap[cID]; !exists {
			consultMap[cID] = &PendingConsultation{
				ID: cID, PatientName: pName, DoctorName: docName, 
				Diagnosis: diagnosis, CreatedAt: date, Prescriptions: []PrescriptionDetail{},
			}
			queue = append(queue, consultMap[cID])
		}

		if prodName != nil && *prodName != "" {
			idx := len(queue) - 1
			d, f, durStr := "", "", ""
			if dosage != nil { d = *dosage }
			if freq != nil { f = *freq }
			if dur != nil { durStr = *dur }

			queue[idx].Prescriptions = append(queue[idx].Prescriptions, PrescriptionDetail{
				ProductName: *prodName, Dosage: d, Frequency: f, Duration: durStr,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(queue)
}

// MarkConsultationDispensed updates status and auto-deducts inventory (FEFO)
func MarkConsultationDispensed(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConsultationID string `json:"consultation_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Start a transaction for safe inventory deduction
	tx, err := db.Pool.Begin(context.Background())
	if err != nil {
		log.Printf("❌ DB Transaction Error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(context.Background())

	// 1. Fetch all prescriptions for this consultation
	rows, err := tx.Query(context.Background(), 
		"SELECT product_id, quantity FROM prescriptions WHERE consultation_id = $1", req.ConsultationID)
	if err != nil {
		log.Printf("❌ Error fetching prescriptions: %v", err)
		http.Error(w, "Failed to fetch prescriptions", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var prescriptions []struct{ ProductID string; Qty int }
	for rows.Next() {
		var p struct{ ProductID string; Qty int }
		rows.Scan(&p.ProductID, &p.Qty)
		prescriptions = append(prescriptions, p)
	}

	// 2. Deduct stock for each prescription (FEFO: First Expired, First Out)
	for _, p := range prescriptions {
		if p.Qty <= 0 { continue }

		// Get batches for this product, ordered by expiry date (oldest first)
		batchRows, err := tx.Query(context.Background(), 
			"SELECT id, quantity FROM batches WHERE product_id = $1 AND quantity > 0 ORDER BY expiry_date ASC", p.ProductID)
		if err != nil {
			log.Printf("❌ Error fetching batches for product %s: %v", p.ProductID, err)
			continue // Skip this product but continue with others
		}

		remainingToDeduct := p.Qty
		var batchIDs []string
		var batchQtys []int

		for batchRows.Next() {
			var bID string
			var bQty int
			batchRows.Scan(&bID, &bQty)
			batchIDs = append(batchIDs, bID)
			batchQtys = append(batchQtys, bQty)
		}
		batchRows.Close()

		// Perform the deduction
		for i, bID := range batchIDs {
			if remainingToDeduct <= 0 { break }
			
			currentBatchQty := batchQtys[i]
			if currentBatchQty >= remainingToDeduct {
				// This batch has enough stock
				_, err := tx.Exec(context.Background(), 
					"UPDATE batches SET quantity = quantity - $1 WHERE id = $2", remainingToDeduct, bID)
				if err != nil { log.Printf("❌ Batch update error: %v", err) }
				remainingToDeduct = 0
			} else {
				// Empty this batch completely and move to the next
				_, err := tx.Exec(context.Background(), 
					"UPDATE batches SET quantity = 0 WHERE id = $1", bID)
				if err != nil { log.Printf("❌ Batch update error: %v", err) }
				remainingToDeduct -= currentBatchQty
			}
		}

		// Update total stock in products table
		_, err = tx.Exec(context.Background(), 
			"UPDATE products SET total_stock = total_stock - $1 WHERE id = $2", (p.Qty - remainingToDeduct), p.ProductID)
		if err != nil { log.Printf(" Product stock update error: %v", err) }
	}

	// 3. Mark consultation as dispensed
	_, err = tx.Exec(context.Background(), 
		"UPDATE consultations SET status = 'dispensed' WHERE id = $1", req.ConsultationID)
	if err != nil {
		log.Printf("❌ Error marking as dispensed: %v", err)
		http.Error(w, "Failed to update status", http.StatusInternalServerError)
		return
	}

	// Commit the transaction
	if err := tx.Commit(context.Background()); err != nil {
		log.Printf("❌ Commit Error: %v", err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Consultation %s dispensed. Inventory auto-deducted.", req.ConsultationID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Dispensed and inventory updated"})
}