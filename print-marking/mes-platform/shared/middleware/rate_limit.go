package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/pkg/redis"
	"github.com/nd/mes-platform/shared/response"
)

// RateLimit returns a Gin middleware that limits requests per minute for a given key prefix.
// The key is constructed as: <prefix>:<client_ip>  (can be customised per endpoint).
// Uses Redis INCR + EXPIRE for a simple sliding-window approximation.
func RateLimit(redisClient *redis.Client, prefix string, requestsPerMinute int) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := fmt.Sprintf("ratelimit:%s:%s", prefix, c.ClientIP())

		count, err := redisClient.IncrWithExpiry(c.Request.Context(), key, time.Minute)
		if err != nil {
			// Fail open — do not block the request if Redis is unavailable.
			c.Next()
			return
		}

		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", requestsPerMinute))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", max(0, requestsPerMinute-int(count))))

		if int(count) > requestsPerMinute {
			response.TooManyRequests(c)
			c.Abort()
			return
		}

		c.Next()
	}
}

// max returns the larger of two ints (Go 1.21+ built-in, kept here for clarity).
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
