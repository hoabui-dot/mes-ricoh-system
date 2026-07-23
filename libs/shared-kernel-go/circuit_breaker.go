package sharedkernel

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/sony/gobreaker"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

var circuitBreakerStateChanges metric.Int64Counter

func init() {
	counter, err := otel.Meter("mom-platform/circuit-breaker").Int64Counter("circuit_breaker_state_changes_total")
	if err == nil {
		circuitBreakerStateChanges = counter
	}
}

type CircuitBreakerConfig struct {
	Name        string
	Dependency  string
	MaxRequests uint32
	Interval    time.Duration
	Timeout     time.Duration
	MinRequests uint32
	FailureRate float64
}

func NewCircuitBreaker(cfg CircuitBreakerConfig) *gobreaker.CircuitBreaker {
	if cfg.MaxRequests == 0 {
		cfg.MaxRequests = 2
	}
	if cfg.Interval == 0 {
		cfg.Interval = 60 * time.Second
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.MinRequests == 0 {
		cfg.MinRequests = 4
	}
	if cfg.FailureRate == 0 {
		cfg.FailureRate = 0.5
	}
	return gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        cfg.Name,
		MaxRequests: cfg.MaxRequests,
		Interval:    cfg.Interval,
		Timeout:     cfg.Timeout,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			if counts.Requests < cfg.MinRequests {
				return false
			}
			return float64(counts.TotalFailures)/float64(counts.Requests) >= cfg.FailureRate
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			emitCircuitBreakerStateChange(name, cfg.Dependency, from.String(), to.String())
		},
	})
}

func IsCircuitBreakerOpen(err error) bool {
	return errors.Is(err, gobreaker.ErrOpenState) || errors.Is(err, gobreaker.ErrTooManyRequests)
}

type RetryableDependencyError struct {
	Dependency string
	Err        error
}

func (e RetryableDependencyError) Error() string {
	if e.Dependency == "" {
		return fmt.Sprintf("retryable dependency failure: %v", e.Err)
	}
	return fmt.Sprintf("%s retryable dependency failure: %v", e.Dependency, e.Err)
}

func (e RetryableDependencyError) Unwrap() error {
	return e.Err
}

func NewRetryableDependencyError(dependency string, err error) error {
	return RetryableDependencyError{Dependency: dependency, Err: err}
}

func IsRetryableDependencyError(err error) bool {
	var retryable RetryableDependencyError
	return errors.As(err, &retryable) || IsCircuitBreakerOpen(err)
}

func emitCircuitBreakerStateChange(name, dependency, from, to string) {
	log.Printf("[CircuitBreaker] %s dependency=%s state=%s->%s", name, dependency, from, to)
	tracer := otel.Tracer("mom-platform/circuit-breaker")
	ctx, span := tracer.Start(context.Background(), "circuit_breaker.state_change")
	defer span.End()
	span.SetAttributes(
		attribute.String("circuit_breaker.name", name),
		attribute.String("circuit_breaker.dependency", dependency),
		attribute.String("circuit_breaker.state.from", from),
		attribute.String("circuit_breaker.state.to", to),
	)
	span.AddEvent("circuit_breaker.state_change", trace.WithAttributes(traceAttributes(name, dependency, from, to)...))
	if circuitBreakerStateChanges != nil {
		circuitBreakerStateChanges.Add(ctx, 1, metric.WithAttributes(traceAttributes(name, dependency, from, to)...))
	}
	_ = ctx
}

func traceAttributes(name, dependency, from, to string) []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("circuit_breaker.name", name),
		attribute.String("circuit_breaker.dependency", dependency),
		attribute.String("circuit_breaker.state.from", from),
		attribute.String("circuit_breaker.state.to", to),
	}
}
