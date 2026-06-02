package arcpay

import "time"

type Currency string

const (
	RUB Currency = "RUB"
	KZT Currency = "KZT"
	UZS Currency = "UZS"
)

type PaymentMethod string

const (
	BankCard  PaymentMethod = "bank_card"
	SBP       PaymentMethod = "sbp"
	SberPay   PaymentMethod = "sberpay"
	TPay      PaymentMethod = "tpay"
	AlfaPay   PaymentMethod = "alfapay"
	Dolyami   PaymentMethod = "dolyami"
	MirPay    PaymentMethod = "mirpay"
	ApplePay  PaymentMethod = "applepay"
	GooglePay PaymentMethod = "googlepay"
	BNPL      PaymentMethod = "bnpl"
)

type CaptureMode string

const (
	OneStage CaptureMode = "one_stage"
	TwoStage CaptureMode = "two_stage"
)

type PaymentFlowMode string

const (
	H2H      PaymentFlowMode = "h2h"
	Redirect PaymentFlowMode = "redirect"
)

type PaymentStatus string

const (
	PaymentCreated    PaymentStatus = "created"
	PaymentPending    PaymentStatus = "pending"
	PaymentPending3DS PaymentStatus = "pending_3ds"
	PaymentAuthorized PaymentStatus = "authorized"
	PaymentCaptured   PaymentStatus = "captured"
	PaymentSettled    PaymentStatus = "settled"
	PaymentVoided     PaymentStatus = "voided"
	PaymentExpired    PaymentStatus = "expired"
	PaymentRefunded   PaymentStatus = "refunded"
	PaymentChargeback PaymentStatus = "chargeback"
	PaymentDeclined   PaymentStatus = "declined"
	PaymentFailed     PaymentStatus = "failed"
	PaymentTimeout    PaymentStatus = "timeout"
)

type PaymentOperationType string

const (
	OperationExecute         PaymentOperationType = "execute"
	OperationSavedCardCharge PaymentOperationType = "saved_card_charge"
	OperationThreeDS         PaymentOperationType = "three_ds"
	OperationCapture         PaymentOperationType = "capture"
	OperationVoid            PaymentOperationType = "void"
	OperationRefund          PaymentOperationType = "refund"
)

type PaymentOperationStatus string

const (
	OperationInFlight  PaymentOperationStatus = "in_flight"
	OperationSucceeded PaymentOperationStatus = "succeeded"
	OperationFailed    PaymentOperationStatus = "failed"
	OperationUnknown   PaymentOperationStatus = "unknown"
)

type PaymentOperationSummary struct {
	OperationType   PaymentOperationType   `json:"operation_type"`
	Status          PaymentOperationStatus `json:"status"`
	Amount          int64                  `json:"amount"`
	Currency        Currency               `json:"currency"`
	OperationRefID  string                 `json:"operation_ref_id,omitempty"`
	BankOperationID string                 `json:"bank_operation_id,omitempty"`
	BankRRN         string                 `json:"bank_rrn,omitempty"`
	BankAuthCode    string                 `json:"bank_auth_code,omitempty"`
	ErrorCode       string                 `json:"error_code,omitempty"`
	ErrorMessage    string                 `json:"error_message,omitempty"`
	CreatedAt       string                 `json:"created_at"`
	UpdatedAt       string                 `json:"updated_at"`
	CompletedAt     string                 `json:"completed_at,omitempty"`
}

type Payment struct {
	ID               string                    `json:"id"`
	Amount           int64                     `json:"amount"`
	AuthorizedAmount *int64                    `json:"authorized_amount,omitempty"`
	CapturedAmount   *int64                    `json:"captured_amount,omitempty"`
	RefundedAmount   *int64                    `json:"refunded_amount,omitempty"`
	Currency         Currency                  `json:"currency"`
	PaymentMethod    PaymentMethod             `json:"payment_method"`
	Status           PaymentStatus             `json:"status"`
	ExternalID       string                    `json:"external_id,omitempty"`
	Description      string                    `json:"description,omitempty"`
	BankPaymentID    string                    `json:"bank_payment_id,omitempty"`
	BankCode         string                    `json:"bank_code,omitempty"`
	BankOrderID      string                    `json:"bank_order_id,omitempty"`
	BankTerminalID   string                    `json:"bank_terminal_id,omitempty"`
	BankRRN          string                    `json:"bank_rrn,omitempty"`
	BankInternalRef  string                    `json:"bank_internal_ref,omitempty"`
	BankAuthCode     string                    `json:"bank_auth_code,omitempty"`
	CardTokenID      string                    `json:"card_token_id,omitempty"`
	DeclineCode      string                    `json:"decline_code,omitempty"`
	CardMask         string                    `json:"card_mask,omitempty"`
	CardScheme       string                    `json:"card_scheme,omitempty"`
	RedirectURL      string                    `json:"redirect_url,omitempty"`
	PaymentMode      PaymentFlowMode           `json:"payment_mode,omitempty"`
	CaptureMode      CaptureMode               `json:"capture_mode,omitempty"`
	CreatedAt        string                    `json:"created_at"`
	UpdatedAt        string                    `json:"updated_at"`
	Metadata         map[string]string         `json:"metadata,omitempty"`
	Operations       []PaymentOperationSummary `json:"operations"`
}

type PaymentList struct {
	Payments   []Payment `json:"payments"`
	Total      int       `json:"total"`
	NextCursor string    `json:"next_cursor,omitempty"`
	PageSize   int       `json:"page_size"`
}

type TerminalPaymentStatus PaymentStatus

type WaitStatus string

const (
	WaitStatusTerminal    WaitStatus = "terminal"
	WaitStatusNonTerminal WaitStatus = "non_terminal"
)

type WaitForPaymentOptions struct {
	Interval         time.Duration
	Timeout          time.Duration
	TerminalStatuses []TerminalPaymentStatus
}

type WaitForPaymentTerminalResult struct {
	Status        WaitStatus
	Payment       Payment
	PaymentStatus PaymentStatus
	Attempts      int
	Elapsed       time.Duration
	Reason        string
}

type FiscalVATRate string

type FiscalItem struct {
	Name          string        `json:"name"`
	Quantity      string        `json:"quantity"`
	UnitPrice     int64         `json:"unit_price"`
	VATRate       FiscalVATRate `json:"vat_rate"`
	PaymentObject string        `json:"payment_object"`
	PaymentMethod string        `json:"payment_method"`
	Measure       string        `json:"measure"`
}

type CreatePaymentRequest struct {
	Amount        int64             `json:"amount"`
	Currency      Currency          `json:"currency"`
	PaymentMethod PaymentMethod     `json:"payment_method"`
	ExternalID    string            `json:"external_id"`
	CaptureMode   CaptureMode       `json:"capture_mode"`
	CustomerID    string            `json:"customer_id,omitempty"`
	Description   string            `json:"description,omitempty"`
	SuccessURL    string            `json:"success_url,omitempty"`
	FailURL       string            `json:"fail_url,omitempty"`
	CallbackURL   string            `json:"callback_url,omitempty"`
	CustomerEmail string            `json:"customer_email,omitempty"`
	CustomerPhone string            `json:"customer_phone,omitempty"`
	MerchantINN   string            `json:"merchant_inn,omitempty"`
	Metadata      map[string]string `json:"metadata,omitempty"`
	FiscalItems   []FiscalItem      `json:"fiscal_items,omitempty"`
}

type CreateCardSetupRequest struct {
	Currency    Currency          `json:"currency"`
	CustomerID  string            `json:"customer_id"`
	ExternalID  string            `json:"external_id,omitempty"`
	SuccessURL  string            `json:"success_url"`
	FailURL     string            `json:"fail_url"`
	CallbackURL string            `json:"callback_url,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

type CaptureRequest struct {
	Amount *int64 `json:"amount,omitempty"`
}

type VoidRequest struct {
	Reason string `json:"reason,omitempty"`
}

type CreateRefundRequest struct {
	Amount int64  `json:"amount"`
	Reason string `json:"reason,omitempty"`
}

type Refund struct {
	ID        string   `json:"id"`
	PaymentID string   `json:"payment_id"`
	Amount    int64    `json:"amount"`
	Currency  Currency `json:"currency"`
	Status    string   `json:"status"`
	Reason    string   `json:"reason,omitempty"`
	CreatedAt string   `json:"created_at"`
}

type CardBrowserInfo struct {
	AcceptHeader          string `json:"accept_header"`
	Language              string `json:"language"`
	ScreenWidth           int    `json:"screen_width"`
	ScreenHeight          int    `json:"screen_height"`
	ColorDepth            int    `json:"color_depth"`
	TimezoneOffsetMinutes int    `json:"timezone_offset_minutes"`
	JavaEnabled           *bool  `json:"java_enabled,omitempty"`
	UserAgent             string `json:"user_agent"`
	WindowSize            string `json:"window_size,omitempty"`
}

type WalletInteraction struct {
	Provider    PaymentMethod `json:"provider"`
	Surface     string        `json:"surface"`
	Action      string        `json:"action"`
	BackURL     string        `json:"back_url,omitempty"`
	AppDeepLink string        `json:"app_deep_link,omitempty"`
	Phone       string        `json:"phone,omitempty"`
}

type WalletAction struct {
	Provider      PaymentMethod `json:"provider"`
	Action        string        `json:"action"`
	SDK           string        `json:"sdk,omitempty"`
	URL           string        `json:"url,omitempty"`
	QRURL         string        `json:"qr_url,omitempty"`
	QRImageBase64 string        `json:"qr_image_base64,omitempty"`
	QRContentType string        `json:"qr_content_type,omitempty"`
	BankInvoiceID string        `json:"bank_invoice_id,omitempty"`
	BackURL       string        `json:"back_url,omitempty"`
}

type ExecutePaymentRequest interface {
	executePaymentRequest()
}

type CardExecutePaymentRequest struct {
	PaymentMethod PaymentMethod   `json:"payment_method"`
	CardTokenID   string          `json:"card_token_id"`
	PaymentMode   PaymentFlowMode `json:"payment_mode"`
	BrowserInfo   CardBrowserInfo `json:"browser_info"`
}

func (CardExecutePaymentRequest) executePaymentRequest() {}

type WalletExecutePaymentRequest struct {
	PaymentMethod     PaymentMethod     `json:"payment_method"`
	PaymentMode       PaymentFlowMode   `json:"payment_mode"`
	WalletInteraction WalletInteraction `json:"wallet_interaction"`
}

func (WalletExecutePaymentRequest) executePaymentRequest() {}

type ExecutePaymentResponse struct {
	PaymentID        string             `json:"payment_id"`
	Status           PaymentStatus      `json:"status"`
	AuthorizedAmount *int64             `json:"authorized_amount,omitempty"`
	PaymentMode      PaymentFlowMode    `json:"payment_mode,omitempty"`
	LiabilityShifted *bool              `json:"liability_shifted,omitempty"`
	CardTokenID      string             `json:"card_token_id,omitempty"`
	WalletAction     *WalletAction      `json:"wallet_action,omitempty"`
	NextAction       *PaymentNextAction `json:"next_action,omitempty"`
	DeclineCode      string             `json:"decline_code,omitempty"`
	DeclineMessage   string             `json:"decline_message,omitempty"`
}

type PaymentNextAction struct {
	Type    string        `json:"type"`
	ThreeDS ThreeDSAction `json:"three_ds"`
}

type ThreeDSAction struct {
	Version              string      `json:"version"`
	Phase                string      `json:"phase"`
	ThreeDSServerTransID string      `json:"three_ds_server_trans_id,omitempty"`
	CompletionEndpoint   string      `json:"completion_endpoint,omitempty"`
	Submit               BrowserPost `json:"submit"`
}

type BrowserPost struct {
	Method string             `json:"method"`
	URL    string             `json:"url"`
	Target string             `json:"target"`
	Fields []BrowserPostField `json:"fields"`
}

type BrowserPostField struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ChargeSavedCardRequest struct {
	Amount      int64             `json:"amount"`
	Currency    Currency          `json:"currency"`
	CardTokenID string            `json:"card_token_id"`
	CustomerID  string            `json:"customer_id"`
	ExternalID  string            `json:"external_id,omitempty"`
	Description string            `json:"description,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	MerchantINN string            `json:"merchant_inn,omitempty"`
	FiscalItems []FiscalItem      `json:"fiscal_items,omitempty"`
}

type CompleteThreeDSMethodRequest struct {
	CompletionIndicator  string `json:"completion_indicator"`
	ThreeDSServerTransID string `json:"three_ds_server_trans_id"`
}

type AvailablePaymentMethod struct {
	Method              PaymentMethod   `json:"method"`
	PaymentMode         PaymentFlowMode `json:"payment_mode"`
	DisplayName         string          `json:"display_name"`
	IsActive            bool            `json:"is_active"`
	UnavailableReason   string          `json:"unavailable_reason,omitempty"`
	IconURL             string          `json:"icon_url,omitempty"`
	SupportedCurrencies []Currency      `json:"supported_currencies,omitempty"`
	SupportedCountries  []string        `json:"supported_countries,omitempty"`
	MinAmount           *int64          `json:"min_amount,omitempty"`
	MaxAmount           *int64          `json:"max_amount,omitempty"`
	SandboxRequirements string          `json:"sandbox_requirements,omitempty"`
}

type CreateLinkRequest struct {
	LinkType           string              `json:"link_type"`
	Amount             int64               `json:"amount"`
	Currency           Currency            `json:"currency"`
	Description        string              `json:"description,omitempty"`
	Environment        string              `json:"environment,omitempty"`
	MaxUses            *int                `json:"max_uses,omitempty"`
	ExpiresAt          string              `json:"expires_at,omitempty"`
	CustomerName       string              `json:"customer_name,omitempty"`
	CustomerID         string              `json:"customer_id,omitempty"`
	CustomerEmail      string              `json:"customer_email,omitempty"`
	DueDate            string              `json:"due_date,omitempty"`
	RedirectURL        string              `json:"redirect_url,omitempty"`
	WebhookURL         string              `json:"webhook_url,omitempty"`
	ExternalOrderID    string              `json:"external_order_id,omitempty"`
	Metadata           map[string]string   `json:"metadata,omitempty"`
	CaptureMode        CaptureMode         `json:"capture_mode"`
	AutocompletionDate string              `json:"autocompletion_date,omitempty"`
	Locale             string              `json:"locale,omitempty"`
	PaymentMethods     []LinkPaymentMethod `json:"payment_methods"`
	Items              []LinkItem          `json:"items,omitempty"`
	BillingConfig      *BillingConfig      `json:"billing_config,omitempty"`
}

type BillingConfig struct {
	IntervalType  string `json:"interval_type,omitempty"`
	IntervalCount int    `json:"interval_count,omitempty"`
	TrialDays     int    `json:"trial_days,omitempty"`
	TrialPrice    int64  `json:"trial_price,omitempty"`
}

type LinkPaymentMethod struct {
	Method      PaymentMethod   `json:"method"`
	PaymentMode PaymentFlowMode `json:"payment_mode"`
	DisplayName string          `json:"display_name,omitempty"`
}

type LinkItem struct {
	Name          string `json:"name,omitempty"`
	Quantity      string `json:"quantity,omitempty"`
	UnitPrice     int64  `json:"unit_price,omitempty"`
	VATRate       int    `json:"vat_rate,omitempty"`
	PaymentObject string `json:"payment_object,omitempty"`
	PaymentMethod string `json:"payment_method,omitempty"`
	Measure       string `json:"measure,omitempty"`
}

type Link struct {
	ID                 string              `json:"id"`
	TenantID           string              `json:"tenant_id,omitempty"`
	OrganizationID     string              `json:"organization_id,omitempty"`
	ShortCode          string              `json:"short_code"`
	LinkType           string              `json:"link_type"`
	Status             string              `json:"status"`
	Environment        string              `json:"environment"`
	Amount             int64               `json:"amount"`
	Currency           Currency            `json:"currency"`
	CreatedAt          string              `json:"created_at,omitempty"`
	UpdatedAt          string              `json:"updated_at,omitempty"`
	Description        string              `json:"description,omitempty"`
	URL                string              `json:"url"`
	MaxUses            *int                `json:"max_uses,omitempty"`
	UsesCount          int                 `json:"uses_count,omitempty"`
	ExpiresAt          string              `json:"expires_at,omitempty"`
	CustomerName       string              `json:"customer_name,omitempty"`
	CustomerID         string              `json:"customer_id,omitempty"`
	CustomerEmail      string              `json:"customer_email,omitempty"`
	DueDate            string              `json:"due_date,omitempty"`
	ExternalOrderID    string              `json:"external_order_id,omitempty"`
	PaymentMethods     []LinkPaymentMethod `json:"payment_methods"`
	RedirectURL        string              `json:"redirect_url,omitempty"`
	WebhookURL         string              `json:"webhook_url,omitempty"`
	Items              []LinkItem          `json:"items,omitempty"`
	BillingConfig      *BillingConfig      `json:"billing_config,omitempty"`
	Metadata           map[string]string   `json:"metadata,omitempty"`
	CaptureMode        CaptureMode         `json:"capture_mode"`
	AutocompletionDate string              `json:"autocompletion_date,omitempty"`
	Locale             string              `json:"locale,omitempty"`
}

type CreateCheckoutSessionRequest struct {
	Amount             int64               `json:"amount"`
	Currency           Currency            `json:"currency"`
	Description        string              `json:"description,omitempty"`
	PaymentMethods     []LinkPaymentMethod `json:"payment_methods"`
	CaptureMode        CaptureMode         `json:"capture_mode"`
	SuccessURL         string              `json:"success_url,omitempty"`
	FailURL            string              `json:"fail_url,omitempty"`
	CancelURL          string              `json:"cancel_url,omitempty"`
	CustomerEmail      string              `json:"customer_email,omitempty"`
	CustomerID         string              `json:"customer_id,omitempty"`
	ExternalID         string              `json:"external_id,omitempty"`
	Metadata           map[string]string   `json:"metadata,omitempty"`
	FiscalItems        []FiscalItem        `json:"fiscal_items,omitempty"`
	AutocompletionDate string              `json:"autocompletion_date,omitempty"`
	Locale             string              `json:"locale,omitempty"`
}

type CheckoutSession struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type ListPaymentsQuery struct {
	Cursor        string
	PageSize      int
	Status        PaymentStatus
	PaymentMethod PaymentMethod
	BankCode      string
	DeclineCode   string
	PaymentFlowID string
	Search        string
	DateFrom      string
	DateTo        string
}

type ListAvailablePaymentMethodsQuery struct {
	Environment string
}
