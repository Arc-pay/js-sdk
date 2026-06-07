package arcpay

import "errors"

type ErrorType string

const (
	ValidationError     ErrorType = "validation_error"
	AuthenticationError ErrorType = "authentication_error"
	AuthorizationError  ErrorType = "authorization_error"
	StateError          ErrorType = "state_error"
	RateLimitError      ErrorType = "rate_limit_error"
	APIError            ErrorType = "api_error"
	NetworkError        ErrorType = "network_error"
)

type Error struct {
	Type        ErrorType
	Code        string
	Message     string
	Param       string
	RequestID   string
	DeclineCode string
	Retryable   bool
	// RetryAfterSeconds is set from the Retry-After response header when present.
	RetryAfterSeconds int
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return e.Code
	}
	return string(e.Type)
}

func AsError(err error, target **Error) bool {
	return errors.As(err, target)
}
