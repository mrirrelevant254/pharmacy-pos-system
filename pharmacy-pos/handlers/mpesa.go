package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"pharmacy-pos/db"
	"time"

	"github.com/joho/godotenv" //  Add this
)


var _ = godotenv.Load("../.env") 


var (
	ConsumerKey    = os.Getenv("MPESA_CONSUMER_KEY")
	ConsumerSecret = os.Getenv("MPESA_CONSUMER_SECRET")
	Shortcode      = os.Getenv("MPESA_SHORTCODE")
	Passkey        = os.Getenv("MPESA_PASSKEY")
	BaseURL        = "https://sandbox.safaricom.co.ke"
)

type STKPushRequest struct {
	Phone  string  `json:"phone"`
	Amount float64 `json:"amount"`
	SaleID string  `json:"sale_id"`
}

type STKPushResponse struct {
	CheckoutRequestID   string `json:"CheckoutRequestID"`
	ResponseCode        string `json:"ResponseCode"`
	ResponseDescription string `json:"ResponseDescription"`
}

// GetMpesaToken fetches the OAuth token from Daraja
func GetMpesaToken() (string, error) {
	url := fmt.Sprintf("%s/oauth/v1/generate?grant_type=client_credentials", BaseURL)
	req, _ := http.NewRequest("GET", url, nil)
	req.SetBasicAuth(ConsumerKey, ConsumerSecret)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("❌ Network error reaching Safaricom: %v", err)
		return "", err
	}
	defer resp.Body.Close()

	// Read the raw response body for debugging
	bodyBytes, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		log.Printf("❌ Failed to parse Safaricom response: %s", string(bodyBytes))
		return "", fmt.Errorf("failed to parse response")
	}

	token, ok := result["access_token"].(string)
	if !ok {
		log.Printf("❌ Safaricom rejected your credentials. Response: %s", string(bodyBytes))
		return "", fmt.Errorf("invalid credentials or sandbox down")
	}

	log.Println("✅ Successfully fetched M-Pesa Token")
	return token, nil
}

// InitiateSTKPush sends the prompt to the customer's phone
func InitiateSTKPush(w http.ResponseWriter, r *http.Request) {
	var req STKPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("❌ Error decoding request: %v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("📞 Received STK Push Request: Phone=%s, Amount=%.2f, SaleID=%s", req.Phone, req.Amount, req.SaleID)

	token, err := GetMpesaToken()
	if err != nil {
		log.Printf("❌ Failed to get token: %v", err)
		http.Error(w, "Failed to get M-Pesa token", http.StatusInternalServerError)
		return
	}

	timestamp := time.Now().Format("20060102150405")
	password := base64.StdEncoding.EncodeToString([]byte(Shortcode + Passkey + timestamp))

	// Format phone number
	phone := req.Phone
	if len(phone) == 10 && phone[0] == '0' {
		phone = "254" + phone[1:]
	}
	log.Printf("📱 Formatted Phone Number: %s", phone)

	// ⚠️ CHECK THIS URL CAREFULLY ⚠️
	callbackURL := "https://slick-reflected-unbridle.ngrok-free.dev" 
	log.Printf("🔗 Using Callback URL: %s", callbackURL)

	payload := map[string]interface{}{
		"BusinessShortCode": Shortcode,
		"Password":          password,
		"Timestamp":         timestamp,
		"TransactionType":   "CustomerPayBillOnline",
		"Amount":            req.Amount,
		"PartyA":            phone,
		"PartyB":            Shortcode,
		"PhoneNumber":       phone,
		"CallBackURL":       callbackURL,
		"AccountReference":  "PharmacyPOS",
		"TransactionDesc":   "Payment for Pharmacy Goods",
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("❌ Error marshaling payload: %v", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	url := fmt.Sprintf("%s/mpesa/stkpush/v1/processrequest", BaseURL)
	log.Printf("🚀 Sending request to Safaricom: %s", url)

	httpReq, _ := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("❌ CRITICAL: Network request to Safaricom failed: %v", err)
		http.Error(w, "Failed to send STK push", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// Read the raw response body
	respBody, _ := io.ReadAll(resp.Body)
	log.Printf(" Safaricom Response Status: %s", resp.Status)
	log.Printf(" Safaricom Response Body: %s", string(respBody))

	var stkResp STKPushResponse
	if err := json.Unmarshal(respBody, &stkResp); err != nil {
		log.Printf("❌ Error parsing Safaricom response: %v", err)
		http.Error(w, "Failed to parse response", http.StatusInternalServerError)
		return
	}

	// Update sale with pending M-Pesa status
	db.Pool.Exec(context.Background(), `
		UPDATE sales SET payment_method = 'mpesa', payment_status = 'pending' WHERE id = $1`, req.SaleID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stkResp)
}

// MpesaCallback receives the result from Safaricom
func MpesaCallback(w http.ResponseWriter, r *http.Request) {
	var callbackData map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&callbackData); err != nil {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"ResultCode": "0", "ResultDesc": "Accepted"})
		return
	}

	log.Printf("📞 M-Pesa Callback Received: %v", callbackData)

	body, ok := callbackData["Body"].(map[string]interface{})
	if !ok {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"ResultCode": "0", "ResultDesc": "Accepted"})
		return
	}
	
	stkCallback, ok := body["stkCallback"].(map[string]interface{})
	if !ok {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"ResultCode": "0", "ResultDesc": "Accepted"})
		return
	}
	
	resultCode, ok := stkCallback["ResultCode"].(float64)
	if !ok {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"ResultCode": "0", "ResultDesc": "Accepted"})
		return
	}

	if resultCode == 0 { // Success
		callbackMetadata, ok := stkCallback["CallbackMetadata"].(map[string]interface{})
		if ok {
			items, ok := callbackMetadata["Item"].([]interface{})
			if ok {
				var receiptNumber string
				for _, item := range items {
					m, ok := item.(map[string]interface{})
					if ok && m["Name"] == "MpesaReceiptNumber" {
						receiptNumber = fmt.Sprintf("%v", m["Value"])
					}
				}

				if receiptNumber != "" {
					_, err := db.Pool.Exec(context.Background(), `
						UPDATE sales 
						SET payment_status = 'completed', mpesa_receipt_number = $1 
						WHERE id = (SELECT id FROM sales WHERE payment_method = 'mpesa' AND payment_status = 'pending' ORDER BY created_at DESC LIMIT 1)`, 
						receiptNumber)
					if err != nil {
						log.Printf("Error updating sale with M-Pesa receipt: %v", err)
					} else {
						log.Printf("✅ Sale marked as completed with Receipt: %s", receiptNumber)
					}
				}
			}
		}
	} else {
		// Failed or Cancelled
		log.Printf("❌ M-Pesa Payment Failed or Cancelled. ResultCode: %v", resultCode)
		_, err := db.Pool.Exec(context.Background(), `
			UPDATE sales SET payment_status = 'failed' WHERE payment_method = 'mpesa' AND payment_status = 'pending' ORDER BY created_at DESC LIMIT 1`)
		if err != nil {
			log.Printf("Error marking sale as failed: %v", err)
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"ResultCode": "0", "ResultDesc": "Accepted"})
}