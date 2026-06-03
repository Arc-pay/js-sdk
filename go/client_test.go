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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

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
		MaxNetworkRetries: RetryCount(1),
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

func TestMaxNetworkRetriesZeroDisablesRetries(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"type":"api_error","code":"service_unavailable","message":"dependency unavailable","request_id":"req_no_retry"}}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{
		SecretKey:         "sk_test_123",
		APIBase:           server.URL + "/v1",
		MaxNetworkRetries: RetryCount(0),
		RetryDelay:        func(int, *Error) time.Duration { return 0 },
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreatePayment(context.Background(), CreatePaymentRequest{
		Amount:        10000,
		Currency:      RUB,
		PaymentMethod: BankCard,
		ExternalID:    "order-no-retry",
		CaptureMode:   OneStage,
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	var apiErr *Error
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "service_unavailable" || !apiErr.Retryable {
		t.Fatalf("unexpected error: %#v", apiErr)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestRequestTimeoutReturnsTypedRetryableAPIError(t *testing.T) {
	client, err := NewClient(ClientOptions{
		SecretKey: "sk_test_123",
		APIBase:   "https://api.example.test/v1",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			<-req.Context().Done()
			return nil, req.Context().Err()
		})},
		Timeout:           time.Millisecond,
		MaxNetworkRetries: RetryCount(0),
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreatePayment(context.Background(), CreatePaymentRequest{
		Amount:        10000,
		Currency:      RUB,
		PaymentMethod: BankCard,
		ExternalID:    "order-timeout-ms",
		CaptureMode:   OneStage,
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	var apiErr *Error
	if !AsError(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Type != APIError || apiErr.Code != "request_timeout" || !apiErr.Retryable {
		t.Fatalf("unexpected error: %#v", apiErr)
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
		MaxNetworkRetries: RetryCount(2),
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

func TestExecutePaymentDecodesTypedWalletAction(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"payment_id":"pay_1",
			"status":"pending",
			"payment_mode":"h2h",
			"wallet_action":{
				"provider":"sberpay",
				"action":"qr",
				"qr_url":"https://bank.example/sberpay/qr/123",
				"back_url":"https://merchant.example/back"
			}
		}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123", APIBase: server.URL + "/v1"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.ExecutePayment(context.Background(), "pay_1", WalletExecutePaymentRequest{
		PaymentMethod: SberPay,
		PaymentMode:   H2H,
		WalletInteraction: WalletInteraction{
			Provider: SberPay,
			Surface:  "merchant_web",
			Action:   "qr",
		},
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	if err != nil {
		t.Fatal(err)
	}
	if result.WalletAction == nil {
		t.Fatal("expected wallet action")
	}
	if result.WalletAction.Provider != SberPay || result.WalletAction.Action != "qr" {
		t.Fatalf("unexpected wallet action: %#v", result.WalletAction)
	}
	if result.WalletAction.QRURL != "https://bank.example/sberpay/qr/123" {
		t.Fatalf("QRURL = %q", result.WalletAction.QRURL)
	}
}

func TestChargeSavedCardSendsFiscalBuyerContactAndItemCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/payments/saved-card" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if got := r.Header.Get("Idempotency-Key"); got != testIdempotencyKey {
			t.Fatalf("Idempotency-Key = %q", got)
		}
		var body ChargeSavedCardRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.CustomerEmail != "buyer@example.test" || body.CustomerPhone != "+79990001122" {
			t.Fatalf("buyer contact was not serialized: %#v", body)
		}
		if len(body.FiscalItems) != 1 || body.FiscalItems[0].ItemCode != "sku-1" {
			t.Fatalf("fiscal item code was not serialized: %#v", body.FiscalItems)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"payment_id":"11111111-1111-1111-1111-111111111111",
			"status":"pending"
		}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123", APIBase: server.URL + "/v1"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.ChargeSavedCard(context.Background(), ChargeSavedCardRequest{
		Amount:        10000,
		Currency:      RUB,
		CardTokenID:   "22222222-2222-2222-2222-222222222222",
		CustomerID:    "customer-1",
		CustomerEmail: "buyer@example.test",
		CustomerPhone: "+79990001122",
		MerchantINN:   "5027119066",
		FiscalItems: []FiscalItem{{
			Name:          "Service",
			Quantity:      "1",
			UnitPrice:     10000,
			VATRate:       NoVAT,
			PaymentObject: "service",
			PaymentMethod: "full_payment",
			Measure:       "piece",
			ItemCode:      "sku-1",
		}},
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	if err != nil {
		t.Fatal(err)
	}
}

func TestCreateLinkDecodesFullLinkShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"link_1",
			"tenant_id":"tenant_1",
			"organization_id":"org_1",
			"short_code":"abc123",
			"link_type":"recurring",
			"status":"active",
			"environment":"sandbox",
			"amount":10000,
			"currency":"RUB",
			"created_at":"2026-06-02T10:00:00Z",
			"updated_at":"2026-06-02T10:00:00Z",
			"description":"Subscription",
			"url":"https://pay.example/link/abc123",
			"max_uses":3,
			"uses_count":1,
			"expires_at":"2026-07-02T10:00:00Z",
			"customer_name":"Ivan",
			"customer_id":"cust_1",
			"customer_email":"ivan@example.test",
			"due_date":"2026-06-15",
			"external_order_id":"order_1",
			"payment_methods":[{"method":"bank_card","payment_mode":"h2h","display_name":"Card"}],
			"redirect_url":"https://merchant.example/return",
			"webhook_url":"https://merchant.example/webhook",
			"items":[{"name":"Plan","quantity":"1","unit_price":10000,"vat_rate":20}],
			"billing_config":{"interval_type":"month","interval_count":1,"trial_days":7,"trial_price":100},
			"metadata":{"plan":"pro"},
			"capture_mode":"one_stage",
			"autocompletion_date":"2026-06-03",
			"locale":"ru"
		}`))
	}))
	defer server.Close()

	client, err := NewClient(ClientOptions{SecretKey: "sk_test_123", APIBase: server.URL + "/v1"})
	if err != nil {
		t.Fatal(err)
	}
	link, err := client.CreateLink(context.Background(), CreateLinkRequest{
		LinkType:    "recurring",
		Amount:      10000,
		Currency:    RUB,
		CaptureMode: OneStage,
		PaymentMethods: []LinkPaymentMethod{
			{Method: BankCard, PaymentMode: H2H},
		},
		BillingConfig: &BillingConfig{IntervalType: "month", IntervalCount: 1},
	}, IdempotencyOptions{IdempotencyKey: testIdempotencyKey})
	if err != nil {
		t.Fatal(err)
	}
	if link.TenantID != "tenant_1" || link.OrganizationID != "org_1" || link.UsesCount != 1 {
		t.Fatalf("unexpected link shape: %#v", link)
	}
	if link.BillingConfig == nil || link.BillingConfig.IntervalType != "month" || link.BillingConfig.TrialPrice != 100 {
		t.Fatalf("unexpected billing config: %#v", link.BillingConfig)
	}
	if len(link.Items) != 1 || link.Items[0].Name != "Plan" {
		t.Fatalf("unexpected link items: %#v", link.Items)
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
