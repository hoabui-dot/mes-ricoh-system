package usecase

import "sync/atomic"

var (
	materialRequestAttempts          atomic.Uint64
	materialRequestIdempotentReplays atomic.Uint64
	materialRequestShortages         atomic.Uint64
)

func MaterialRequestMetrics() (attempts, replays, shortages uint64) {
	return materialRequestAttempts.Load(), materialRequestIdempotentReplays.Load(), materialRequestShortages.Load()
}
