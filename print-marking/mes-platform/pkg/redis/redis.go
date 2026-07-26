// Package redis provides a production-grade Redis client built on go-redis/v9.
// It supports cache operations, distributed locking, idempotency keys,
// session storage, and rate limiting.
package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Config holds Redis connection settings.
type Config struct {
	Host     string
	Port     int
	Password string
	DB       int
	PoolSize int
}

// Client wraps redis.Client and exposes domain-specific helpers.
type Client struct {
	rdb *redis.Client
}

// New creates and validates a Redis client connection.
func New(cfg Config) (*Client, error) {
	poolSize := cfg.PoolSize
	if poolSize == 0 {
		poolSize = 10
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
		PoolSize: poolSize,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis: ping failed: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// Close gracefully closes the Redis connection pool.
func (c *Client) Close() error {
	return c.rdb.Close()
}

// Ping checks Redis connectivity. Use in health checks.
func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

// ─── Cache Operations ──────────────────────────────────────────────────────────

// Set stores a value with an expiry. Use 0 for no expiry.
func (c *Client) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, value, ttl).Err()
}

// Get retrieves a string value by key. Returns redis.Nil if not found.
func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

// Del deletes one or more keys.
func (c *Client) Del(ctx context.Context, keys ...string) error {
	return c.rdb.Del(ctx, keys...).Err()
}

// Exists checks whether a key exists. Returns (true, nil) when found.
func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	n, err := c.rdb.Exists(ctx, key).Result()
	return n > 0, err
}

// ─── Distributed Lock ──────────────────────────────────────────────────────────

// AcquireLock tries to acquire an exclusive lock identified by key.
// It uses SET NX EX to guarantee atomicity.
// Returns (true, nil) when the lock is acquired.
func (c *Client) AcquireLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	ok, err := c.rdb.SetNX(ctx, "lock:"+key, 1, ttl).Result()
	return ok, err
}

// ReleaseLock releases an exclusive lock.
func (c *Client) ReleaseLock(ctx context.Context, key string) error {
	return c.rdb.Del(ctx, "lock:"+key).Err()
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

// SetIdempotencyKey stores an idempotency marker with a TTL.
// Returns false if the key was already set (duplicate request).
func (c *Client) SetIdempotencyKey(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return c.rdb.SetNX(ctx, "idempotency:"+key, 1, ttl).Result()
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

// IncrWithExpiry increments a counter and sets its expiry if it is newly created.
// Returns the current counter value after increment.
func (c *Client) IncrWithExpiry(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	pipe := c.rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// ─── Session ──────────────────────────────────────────────────────────────────

// SetSession stores a session value (e.g. serialized token claims) with a TTL.
func (c *Client) SetSession(ctx context.Context, sessionID string, value string, ttl time.Duration) error {
	return c.rdb.Set(ctx, "session:"+sessionID, value, ttl).Err()
}

// GetSession retrieves a stored session.
func (c *Client) GetSession(ctx context.Context, sessionID string) (string, error) {
	return c.rdb.Get(ctx, "session:"+sessionID).Result()
}

// DeleteSession removes a session (logout / revocation).
func (c *Client) DeleteSession(ctx context.Context, sessionID string) error {
	return c.rdb.Del(ctx, "session:"+sessionID).Err()
}

// Raw returns the underlying *redis.Client for advanced operations.
func (c *Client) Raw() *redis.Client {
	return c.rdb
}
