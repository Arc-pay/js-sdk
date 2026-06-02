package arcpay

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const testIdempotencyKey = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a31"

func TestNewClientRejectsPublishableKeys(t *testing.T) {
	_, err := NewClient(ClientOptions{SecretKey: "pk_test_123"})
	if err == nil {
		t.Fatal("expected publishable key to be rejected")
	}
	var apiErr *Error
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Type != AuthenticationError || apiErr.Code != "invalid_secret_key" {
		t.Fatalf("unexpected error: %#v", apiErr)
	}
}

func TestCreatePaymentSendsServerHeadersAndIdempotencyKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/payments" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method %s", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk_test_123" {
			t.Fatalf("Authorization = %q", got)
		}
		if got := r.Header.Get("X-Arc-Pay-API-Version"); got != "2026-05-06" {
			t.Fatalf("X-Arc-Pay-API-Version = %q", got)
		}
		if got := r.Header.Get("Idempotency-Key"); got != testIdempotencyKey {
			t.Fatalf("Idempotency-Key = %q", got)
		}
		if got := r.Header.Get("User-Agent"); got != "ArcPay-Go/"+goSDKVersion {
			t.Fatalf("User-Agent = %q", got)
		}
		var body CreatePaymentRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Amount != 10000 || body.Currency != RUB || body.PaymentMethod != BankCard {
			t.Fatalf("unexpected body: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"11111111-1111-1111-1111-111111111111",
			"amount":10000,
			"currency":"RUB",
			"payment_method":"bank_card",
			"status":"created",
			"created_at":"2026-05-12T09:00:00Z",
			"updated_at":"2026-05-12T09:00:00Z"
		}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123", APIBase: server.URL + "/v1/"})
	if err != nil {
		t.Fatal(err)
	}
	payment, err := client.CreatePayment(context.Background(), CreatePaymentRequest{
		Amount:        10000,
		Currency:      RUB,
		PaymentMethod: BankCard,
		ExternalID:    "order-1",
		CaptureMode:   OneStage,
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	if err != nil {
		t.Fatal(err)
	}
	if payment.Status != PaymentCreated {
		t.Fatalf("status = %s", payment.Status)
	}
}

func TestCreatePaymentRequiresUUIDIdempotencyKey(t *testing.T) {
	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreatePayment(context.Background(), CreatePaymentRequest{}, IdempotencyOptions{})
	var apiErr *Error
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "missing_idempotency_key" {
		t.Fatalf("code = %q", apiErr.Code)
	}
	_, err = client.CreatePayment(context.Background(), CreatePaymentRequest{}, IdempotencyOptions{IdempotencyKey: "not-a-uuid"})
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "invalid_idempotency_key" {
		t.Fatalf("code = %q", apiErr.Code)
	}
}

func TestCreatePaymentRetriesTransientErrorsWithSameIdempotencyKey(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if got := r.Header.Get("Idempotency-Key"); got != testIdempotencyKey {
			t.Fatalf("Idempotency-Key = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		if attempts == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":{"type":"api_error","code":"service_unavailable","message":"dependency unavailable","request_id":"req_retry_1"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"pay_1","amount":10000,"currency":"RUB","payment_method":"bank_card","status":"created","created_at":"2026-05-12T09:00:00Z","updated_at":"2026-05-12T09:00:00Z"}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{
		SecretKey:         "sk_test_123",
		APIBase:           server.URL + "/v1",
		MaxNetworkRetries: 1,
		RetryDelay:        func(int, *Error) time.Duration { return 0 },
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreatePayment(context.Background(), CreatePaymentRequest{
		Amount:        10000,
		Currency:      RUB,
		PaymentMethod: BankCard,
		ExternalID:    "order-retry",
		CaptureMode:   OneStage,
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 2 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestCreatePaymentDoesNotRetryArcPayTimeoutResponse(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGatewayTimeout)
		_, _ = w.Write([]byte(`{"error":{"type":"api_error","code":"timeout","message":"processing timeout; poll payment status","request_id":"req_timeout"}}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{
		SecretKey:         "sk_test_123",
		APIBase:           server.URL + "/v1",
		MaxNetworkRetries: 2,
		RetryDelay:        func(int, *Error) time.Duration { return 0 },
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreatePayment(context.Background(), CreatePaymentRequest{
		Amount:        10000,
		Currency:      RUB,
		PaymentMethod: BankCard,
		ExternalID:    "order-timeout",
		CaptureMode:   OneStage,
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	var apiErr *Error
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "timeout" || apiErr.Retryable {
		t.Fatalf("unexpected error: %#v", apiErr)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestExecutePaymentRequiresH2HMode(t *testing.T) {
	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.ExecutePayment(context.Background(), "pay_1", CardExecutePaymentRequest{
		PaymentMethod: BankCard,
		CardTokenID:   "tok_1",
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	var apiErr *Error
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "invalid_payment_mode" {
		t.Fatalf("code = %q", apiErr.Code)
	}
}

func TestWaitForPaymentTerminalResultReturnsDiagnostics(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		if attempts == 1 {
			_, _ = w.Write([]byte(`{"id":"pay_1","amount":10000,"currency":"RUB","payment_method":"bank_card","status":"pending_3ds","created_at":"2026-05-12T09:00:00Z","updated_at":"2026-05-12T09:00:00Z"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"pay_1","amount":10000,"currency":"RUB","payment_method":"bank_card","status":"captured","created_at":"2026-05-12T09:00:00Z","updated_at":"2026-05-12T09:00:02Z"}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123", APIBase: server.URL + "/v1"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.WaitForPaymentTerminalResult(context.Background(), "pay_1", WaitForPaymentOptions{
		Interval: time.Millisecond,
		Timeout:  100 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != WaitStatusTerminal || result.PaymentStatus != PaymentCaptured || result.Attempts != 2 {
		t.Fatalf("unexpected result: %#v", result)
	}
}
