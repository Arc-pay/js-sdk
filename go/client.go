package arcpay

import (
	"bytes"
	"context"
	cryptorand "crypto/rand"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultAPIBase           = "https://api.arcpay.space/v1"
	apiVersion               = "2026-05-06"
	goSDKVersion             = "0.1.46"
	defaultTimeout           = 30 * time.Second
	defaultMaxNetworkRetries = 1
	defaultPollInterval      = 1500 * time.Millisecond
	defaultPollTimeout       = 60 * time.Second
	httpStatusServerError    = 500
)

var idempotencyKeyPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type RetryDelayFunc func(attempt int, err *Error) time.Duration

type ClientOptions struct {
	SecretKey         string
	APIBase           string
	HTTPClient        *http.Client
	Timeout           time.Duration
	MaxNetworkRetries *int
	RetryDelay        RetryDelayFunc
}

type RequestOptions struct {
	Timeout time.Duration
}

type IdempotencyOptions struct {
	IdempotencyKey string
	Timeout        time.Duration
}

type Client struct {
	secretKey         string
	apiBase           string
	httpClient        *http.Client
	timeout           time.Duration
	maxNetworkRetries int
	retryDelay        RetryDelayFunc
}

// RetryCount keeps optional retry configuration ergonomic for SDK callers.
//
//nolint:modernize // Keep exported pointer helper for SDK callers.
func RetryCount(value int) *int {
	return &value
}

func NewClient(options ClientOptions) (*Client, error) {
	if err := validateSecretKey(options.SecretKey); err != nil {
		return nil, err
	}
	timeout := options.Timeout
	if timeout == 0 {
		timeout = defaultTimeout
	}
	if timeout < 0 {
		return nil, &Error{Type: ValidationError, Code: "invalid_timeout_options", Message: "Timeout must be positive", Retryable: false}
	}
	maxRetries := defaultMaxNetworkRetries
	if options.MaxNetworkRetries != nil {
		maxRetries = *options.MaxNetworkRetries
	}
	if maxRetries < 0 {
		return nil, &Error{Type: ValidationError, Code: "invalid_retry_options", Message: "MaxNetworkRetries must be non-negative", Retryable: false}
	}
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					MinVersion: tls.VersionTLS12,
				},
			},
		}
	}
	apiBase := strings.TrimRight(options.APIBase, "/")
	if apiBase == "" {
		apiBase = defaultAPIBase
	}
	return &Client{
		secretKey:         options.SecretKey,
		apiBase:           apiBase,
		httpClient:        httpClient,
		timeout:           timeout,
		maxNetworkRetries: maxRetries,
		retryDelay:        options.RetryDelay,
	}, nil
}

func validateSecretKey(key string) error {
	if key == "" {
		return &Error{Type: AuthenticationError, Code: "invalid_secret_key", Message: "Secret key must be a non-empty string", Retryable: false}
	}
	if !strings.HasPrefix(key, "sk_test_") && !strings.HasPrefix(key, "sk_live_") {
		return &Error{
			Type:      AuthenticationError,
			Code:      "invalid_secret_key",
			Message:   "Secret key must start with sk_test_ or sk_live_. Publishable keys cannot call server APIs.",
			Retryable: false,
		}
	}
	return nil
}

func requireIdempotencyKey(key string) error {
	if key == "" {
		return &Error{Type: ValidationError, Code: "missing_idempotency_key", Message: "idempotencyKey is required for this operation", Retryable: false}
	}
	if !idempotencyKeyPattern.MatchString(key) {
		return &Error{Type: ValidationError, Code: "invalid_idempotency_key", Message: "idempotencyKey must be a valid UUID", Retryable: false}
	}
	return nil
}

func (c *Client) ListPayments(ctx context.Context, query ListPaymentsQuery, opts RequestOptions) (PaymentList, error) {
	var out PaymentList
	err := c.request(ctx, http.MethodGet, appendPaymentsQuery("/payments", query), nil, "", opts.Timeout, &out)
	return out, err
}

func (c *Client) CreatePayment(ctx context.Context, body CreatePaymentRequest, opts IdempotencyOptions) (Payment, error) {
	var out Payment
	err := c.request(ctx, http.MethodPost, "/payments", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) CreateCardSetup(ctx context.Context, body CreateCardSetupRequest, opts IdempotencyOptions) (Payment, error) {
	var out Payment
	err := c.request(ctx, http.MethodPost, "/cards/setup", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) GetPayment(ctx context.Context, paymentID string, opts RequestOptions) (Payment, error) {
	var out Payment
	err := c.request(ctx, http.MethodGet, "/payments/"+url.PathEscape(paymentID), nil, "", opts.Timeout, &out)
	return out, err
}

func (c *Client) WaitForPaymentTerminal(ctx context.Context, paymentID string, opts WaitForPaymentOptions) (Payment, error) {
	result, err := c.WaitForPaymentTerminalResult(ctx, paymentID, opts)
	if err != nil {
		return Payment{}, err
	}
	if result.Status == WaitStatusTerminal {
		return result.Payment, nil
	}
	return Payment{}, &Error{
		Type:      APIError,
		Code:      "payment_poll_timeout",
		Message:   fmt.Sprintf("Payment %s stayed %s after %s and %d poll attempts", paymentID, result.PaymentStatus, result.Elapsed, result.Attempts),
		Retryable: true,
	}
}

func (c *Client) WaitForPaymentTerminalResult(ctx context.Context, paymentID string, opts WaitForPaymentOptions) (WaitForPaymentTerminalResult, error) {
	interval := opts.Interval
	if interval == 0 {
		interval = defaultPollInterval
	}
	if interval < 0 {
		return WaitForPaymentTerminalResult{}, &Error{Type: ValidationError, Code: "invalid_poll_options", Message: "Polling intervals and timeouts must be positive", Retryable: false}
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = defaultPollTimeout
	}
	if timeout < 0 {
		return WaitForPaymentTerminalResult{}, &Error{Type: ValidationError, Code: "invalid_poll_options", Message: "Polling intervals and timeouts must be positive", Retryable: false}
	}
	terminalStatus := defaultTerminalPaymentStatus
	if len(opts.TerminalStatuses) > 0 {
		terminalStatuses := make(map[PaymentStatus]struct{}, len(opts.TerminalStatuses))
		for _, status := range opts.TerminalStatuses {
			terminalStatuses[PaymentStatus(status)] = struct{}{}
		}
		terminalStatus = func(status PaymentStatus) bool {
			_, ok := terminalStatuses[status]
			return ok
		}
	}
	startedAt := time.Now()
	attempts := 0
	for {
		payment, err := c.GetPayment(ctx, paymentID, RequestOptions{})
		if err != nil {
			return WaitForPaymentTerminalResult{}, err
		}
		attempts++
		elapsed := time.Since(startedAt)
		if terminalStatus(payment.Status) {
			return WaitForPaymentTerminalResult{
				Status:        WaitStatusTerminal,
				Payment:       payment,
				PaymentStatus: payment.Status,
				Attempts:      attempts,
				Elapsed:       elapsed,
			}, nil
		}
		if elapsed >= timeout {
			return WaitForPaymentTerminalResult{
				Status:        WaitStatusNonTerminal,
				Payment:       payment,
				PaymentStatus: payment.Status,
				Attempts:      attempts,
				Elapsed:       elapsed,
				Reason:        "timeout",
			}, nil
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return WaitForPaymentTerminalResult{}, &Error{Type: NetworkError, Message: ctx.Err().Error(), Retryable: false}
		case <-timer.C:
		}
	}
}

func defaultTerminalPaymentStatus(status PaymentStatus) bool {
	switch status {
	case PaymentCreated, PaymentPending, PaymentPending3DS, PaymentTimeout:
		return false
	case PaymentAuthorized, PaymentCaptured, PaymentSettled, PaymentVoided, PaymentExpired, PaymentRefunded, PaymentChargeback, PaymentDeclined, PaymentFailed:
		return true
	}
	return false
}

func (c *Client) CapturePayment(ctx context.Context, paymentID string, body CaptureRequest, opts IdempotencyOptions) (Payment, error) {
	var out Payment
	err := c.request(ctx, http.MethodPost, "/payments/"+url.PathEscape(paymentID)+"/capture", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) VoidPayment(ctx context.Context, paymentID string, body VoidRequest, opts IdempotencyOptions) (Payment, error) {
	var out Payment
	err := c.request(ctx, http.MethodPost, "/payments/"+url.PathEscape(paymentID)+"/void", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) CreateRefund(ctx context.Context, paymentID string, body CreateRefundRequest, opts IdempotencyOptions) (Refund, error) {
	var out Refund
	err := c.request(ctx, http.MethodPost, "/payments/"+url.PathEscape(paymentID)+"/refunds", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) ChargeSavedCard(ctx context.Context, body ChargeSavedCardRequest, opts IdempotencyOptions) (ExecutePaymentResponse, error) {
	var out ExecutePaymentResponse
	err := c.request(ctx, http.MethodPost, "/payments/saved-card", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) ExecutePayment(ctx context.Context, paymentID string, body ExecutePaymentRequest, opts IdempotencyOptions) (ExecutePaymentResponse, error) {
	if err := validateExecutePaymentRequest(body); err != nil {
		return ExecutePaymentResponse{}, err
	}
	var out ExecutePaymentResponse
	err := c.request(ctx, http.MethodPost, "/payments/"+url.PathEscape(paymentID)+"/execute", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) CompleteThreeDSMethod(ctx context.Context, paymentID string, body CompleteThreeDSMethodRequest, opts IdempotencyOptions) (ExecutePaymentResponse, error) {
	var out ExecutePaymentResponse
	err := c.request(ctx, http.MethodPost, "/payments/"+url.PathEscape(paymentID)+"/complete-3ds-method", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) ListAvailablePaymentMethods(ctx context.Context, query ListAvailablePaymentMethodsQuery, opts RequestOptions) ([]AvailablePaymentMethod, error) {
	var out []AvailablePaymentMethod
	values := url.Values{}
	if query.Environment != "" {
		values.Set("environment", query.Environment)
	}
	path := "/payment-methods/available"
	if encoded := values.Encode(); encoded != "" {
		path += "?" + encoded
	}
	err := c.request(ctx, http.MethodGet, path, nil, "", opts.Timeout, &out)
	return out, err
}

func (c *Client) CreateLink(ctx context.Context, body CreateLinkRequest, opts IdempotencyOptions) (Link, error) {
	var out Link
	err := c.request(ctx, http.MethodPost, "/links", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) GetLink(ctx context.Context, linkID string, opts RequestOptions) (Link, error) {
	var out Link
	err := c.request(ctx, http.MethodGet, "/links/"+url.PathEscape(linkID), nil, "", opts.Timeout, &out)
	return out, err
}

func (c *Client) CancelLink(ctx context.Context, linkID string, opts IdempotencyOptions) (Link, error) {
	var out Link
	err := c.request(ctx, http.MethodDelete, "/links/"+url.PathEscape(linkID), nil, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func (c *Client) CreateCheckoutSession(ctx context.Context, body CreateCheckoutSessionRequest, opts IdempotencyOptions) (CheckoutSession, error) {
	var out CheckoutSession
	err := c.request(ctx, http.MethodPost, "/checkout/sessions", body, opts.IdempotencyKey, opts.Timeout, &out)
	return out, err
}

func validateExecutePaymentRequest(body ExecutePaymentRequest) error {
	switch request := body.(type) {
	case CardExecutePaymentRequest:
		if request.PaymentMethod == "" {
			return &Error{Type: ValidationError, Code: "invalid_request", Message: "payment_method is required", Retryable: false}
		}
		if request.PaymentMethod != BankCard {
			return &Error{Type: ValidationError, Code: "invalid_request", Message: "CardExecutePaymentRequest requires payment_method=bank_card", Retryable: false}
		}
		if request.CardTokenID == "" {
			return &Error{Type: ValidationError, Code: "missing_card_token_id", Message: "card_token_id is required for bank_card executePayment", Retryable: false}
		}
		if request.PaymentMode != H2H {
			return &Error{Type: ValidationError, Code: "invalid_payment_mode", Message: "payment_mode must be h2h for executePayment", Retryable: false}
		}
	case WalletExecutePaymentRequest:
		if request.PaymentMethod == "" {
			return &Error{Type: ValidationError, Code: "invalid_request", Message: "payment_method is required", Retryable: false}
		}
		if request.PaymentMethod == BankCard {
			return &Error{Type: ValidationError, Code: "invalid_request", Message: "WalletExecutePaymentRequest cannot use payment_method=bank_card", Retryable: false}
		}
		if request.PaymentMode != H2H {
			return &Error{Type: ValidationError, Code: "invalid_payment_mode", Message: "payment_mode must be h2h for executePayment", Retryable: false}
		}
		if request.WalletInteraction.Provider != request.PaymentMethod {
			return &Error{Type: ValidationError, Code: "invalid_request", Message: "wallet_interaction.provider must match payment_method", Retryable: false}
		}
	default:
		return &Error{Type: ValidationError, Code: "invalid_request", Message: "unsupported executePayment request", Retryable: false}
	}
	return nil
}

func (c *Client) request(ctx context.Context, method, path string, body any, idempotencyKey string, timeout time.Duration, out any) error {
	if method != http.MethodGet {
		if err := requireIdempotencyKey(idempotencyKey); err != nil {
			return err
		}
	}
	safeToRetry := method == http.MethodGet || idempotencyKey != ""
	bodyBytes, err := encodeRequestBody(body)
	if err != nil {
		return err
	}
	requestTimeout, err := c.requestTimeout(timeout)
	if err != nil {
		return err
	}

	var lastErr *Error
	for attempt := 1; ; attempt++ {
		lastErr = c.requestAttempt(ctx, method, path, bodyBytes, idempotencyKey, requestTimeout, out)
		if lastErr == nil {
			return nil
		}
		if !safeToRetry || !lastErr.Retryable || attempt > c.maxNetworkRetries {
			return lastErr
		}
		if retryErr := waitForRetry(ctx, c.delay(attempt, lastErr)); retryErr != nil {
			return retryErr
		}
	}
}

func encodeRequestBody(body any) ([]byte, *Error) {
	if body == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, &Error{Type: ValidationError, Code: "invalid_request", Message: err.Error(), Retryable: false}
	}
	return encoded, nil
}

func (c *Client) requestTimeout(timeout time.Duration) (time.Duration, *Error) {
	if timeout == 0 {
		timeout = c.timeout
	}
	if timeout < 0 {
		return 0, &Error{Type: ValidationError, Code: "invalid_timeout_options", Message: "Timeout must be positive", Retryable: false}
	}
	return timeout, nil
}

func (c *Client) requestAttempt(ctx context.Context, method, path string, bodyBytes []byte, idempotencyKey string, timeout time.Duration, out any) *Error {
	attemptCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(attemptCtx, method, c.apiBase+path, bytes.NewReader(bodyBytes))
	if err != nil {
		return &Error{Type: ValidationError, Code: "invalid_request", Message: err.Error(), Retryable: false}
	}
	c.setHeaders(req, idempotencyKey)
	res, err := c.httpClient.Do(req)
	if err != nil {
		return requestAttemptError(ctx, attemptCtx, err, timeout)
	}
	return decodeResponse(res, out)
}

func requestAttemptError(ctx, attemptCtx context.Context, err error, timeout time.Duration) *Error {
	if attemptCtx.Err() == context.DeadlineExceeded && ctx.Err() == nil {
		return &Error{
			Type:      APIError,
			Code:      "request_timeout",
			Message:   fmt.Sprintf("Request timed out after %s", timeout),
			Retryable: true,
		}
	}
	return &Error{Type: NetworkError, Message: err.Error(), Retryable: ctx.Err() == nil}
}

func waitForRetry(ctx context.Context, delay time.Duration) *Error {
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return &Error{Type: NetworkError, Message: ctx.Err().Error(), Retryable: false}
	case <-timer.C:
		return nil
	}
}

func (c *Client) setHeaders(req *http.Request, idempotencyKey string) {
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("X-Arc-Pay-Api-Version", apiVersion)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ArcPay-Go/"+goSDKVersion)
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
}

func (c *Client) delay(attempt int, err *Error) time.Duration {
	if c.retryDelay != nil {
		delay := c.retryDelay(attempt, err)
		if delay < 0 {
			return 0
		}
		return delay
	}
	base := min(time.Duration(100*(1<<(attempt-1)))*time.Millisecond, time.Second)
	delay := base + cryptoJitter(base)
	if err != nil && err.RetryAfterSeconds > 0 {
		retryAfter := time.Duration(err.RetryAfterSeconds) * time.Second
		if retryAfter > delay {
			return retryAfter
		}
	}
	return delay
}

func cryptoJitter(base time.Duration) time.Duration {
	if base <= 0 {
		return 0
	}
	n, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(base)))
	if err != nil {
		return 0
	}
	return time.Duration(n.Int64())
}

type errorEnvelope struct {
	Error struct {
		Type        string `json:"type"`
		Code        string `json:"code"`
		Message     string `json:"message"`
		Param       string `json:"param"`
		RequestID   string `json:"request_id"`
		DeclineCode string `json:"decline_code"`
	} `json:"error"`
}

func decodeResponse(res *http.Response, out any) *Error {
	defer res.Body.Close()
	if res.StatusCode == http.StatusNoContent {
		return nil
	}
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		if out == nil {
			if _, err := io.Copy(io.Discard, res.Body); err != nil {
				return &Error{Type: APIError, Code: "invalid_response", Message: err.Error(), Retryable: false}
			}
			return nil
		}
		if err := json.NewDecoder(res.Body).Decode(out); err != nil && err != io.EOF {
			return &Error{Type: APIError, Code: "invalid_response", Message: err.Error(), Retryable: false}
		}
		return nil
	}
	var envelope errorEnvelope
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil && err != io.EOF {
		return &Error{Type: APIError, Code: "invalid_response", Message: err.Error(), Retryable: false}
	}
	errType := publicErrorType(envelope.Error.Type, res.StatusCode)
	code := envelope.Error.Code
	requestID := envelope.Error.RequestID
	if requestID == "" {
		requestID = res.Header.Get("x-request-id")
	}
	message := envelope.Error.Message
	if message == "" {
		message = fmt.Sprintf("Request failed with status %d", res.StatusCode)
	}
	return &Error{
		Type:              errType,
		Code:              code,
		Message:           message,
		Param:             envelope.Error.Param,
		RequestID:         requestID,
		DeclineCode:       envelope.Error.DeclineCode,
		Retryable:         isRetryableError(errType, res.StatusCode, code),
		RetryAfterSeconds: retryAfterSeconds(res.Header.Get("Retry-After")),
	}
}

func publicErrorType(value string, status int) ErrorType {
	switch ErrorType(value) {
	case ValidationError, AuthenticationError, AuthorizationError, StateError, RateLimitError, APIError, NetworkError:
		return ErrorType(value)
	}
	if status >= httpStatusServerError {
		return APIError
	}
	return ValidationError
}

func isRetryableError(errorType ErrorType, status int, code string) bool {
	if errorType == RateLimitError {
		return true
	}
	if code == "timeout" {
		return false
	}
	return errorType == APIError && status >= httpStatusServerError
}

func retryAfterSeconds(value string) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil && seconds >= 0 {
		return seconds
	}
	if when, err := http.ParseTime(value); err == nil {
		duration := time.Until(when)
		if duration <= 0 {
			return 0
		}
		return int((duration + time.Second - 1) / time.Second)
	}
	return 0
}

func appendPaymentsQuery(path string, query ListPaymentsQuery) string {
	values := url.Values{}
	if query.Cursor != "" {
		values.Set("cursor", query.Cursor)
	}
	if query.PageSize > 0 {
		values.Set("page_size", strconv.Itoa(query.PageSize))
	}
	if query.Status != "" {
		values.Set("status", string(query.Status))
	}
	if query.PaymentMethod != "" {
		values.Set("payment_method", string(query.PaymentMethod))
	}
	if query.BankCode != "" {
		values.Set("bank_code", query.BankCode)
	}
	if query.DeclineCode != "" {
		values.Set("decline_code", query.DeclineCode)
	}
	if query.PaymentFlowID != "" {
		values.Set("payment_flow_id", query.PaymentFlowID)
	}
	if query.Search != "" {
		values.Set("search", query.Search)
	}
	if query.DateFrom != "" {
		values.Set("date_from", query.DateFrom)
	}
	if query.DateTo != "" {
		values.Set("date_to", query.DateTo)
	}
	if encoded := values.Encode(); encoded != "" {
		return path + "?" + encoded
	}
	return path
}
