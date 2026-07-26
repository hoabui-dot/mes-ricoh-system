// Package server provides the HTTP server configuration and Gin router setup.
package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/pkg/postgres"
	"github.com/nd/mes-platform/pkg/redis"
	"github.com/nd/mes-platform/shared/config"
	"github.com/nd/mes-platform/shared/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

// Server wraps the HTTP server and manages its lifecycle.
type Server struct {
	cfg    *config.Config
	engine *gin.Engine
	log    *logger.Logger
	db     *postgres.DB
	redis  *redis.Client
	httpSrv *http.Server
}

// New creates and configures a new Server.
func New(
	cfg *config.Config,
	log *logger.Logger,
	db *postgres.DB,
	redisClient *redis.Client,
) *Server {
	if cfg.App.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	engine := gin.New()
	s := &Server{
		cfg:    cfg,
		engine: engine,
		log:    log,
		db:     db,
		redis:  redisClient,
	}
	s.setupMiddleware()
	return s
}

// Engine returns the underlying Gin engine for route registration.
func (s *Server) Engine() *gin.Engine {
	return s.engine
}

// V1 returns the /api/v1 route group.
func (s *Server) V1() *gin.RouterGroup {
	return s.engine.Group("/api/v1")
}

// Start begins listening for HTTP connections. It blocks until ctx is cancelled.
func (s *Server) Start(ctx context.Context) error {
	addr := fmt.Sprintf("%s:%d", s.cfg.App.Host, s.cfg.App.Port)
	s.httpSrv = &http.Server{
		Addr:         addr,
		Handler:      s.engine,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	s.log.Info("MES Platform starting",
		zap.String("addr", addr),
		zap.String("env", s.cfg.App.Env),
	)

	errCh := make(chan error, 1)
	go func() {
		if err := s.httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		return s.Shutdown()
	}
}

// Shutdown gracefully stops the HTTP server with a 10-second timeout.
func (s *Server) Shutdown() error {
	s.log.Info("shutting down HTTP server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return s.httpSrv.Shutdown(ctx)
}

// setupMiddleware attaches global Gin middleware.
func (s *Server) setupMiddleware() {
	s.engine.Use(middleware.Recovery(s.log))
	s.engine.Use(middleware.Tracing())
	s.engine.Use(middleware.RequestLogger(s.log))
	s.engine.Use(corsMiddleware(s.cfg.CORS.AllowedOrigins))

	// Health check.
	s.engine.GET("/health", s.healthHandler)

	// Metrics.
	if s.cfg.Metrics.Enabled {
		s.engine.GET(s.cfg.Metrics.Path, gin.WrapH(promhttp.Handler()))
	}
}

// healthHandler returns service health status.
func (s *Server) healthHandler(c *gin.Context) {
	status := "healthy"
	code := http.StatusOK

	dbErr := s.db.Ping()
	redisErr := s.redis.Ping(c.Request.Context())

	if dbErr != nil || redisErr != nil {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}

	c.JSON(code, gin.H{
		"status":    status,
		"service":   "mes-platform",
		"timestamp": time.Now().UTC(),
		"checks": gin.H{
			"database": boolStatus(dbErr == nil),
			"redis":    boolStatus(redisErr == nil),
		},
	})
}

func boolStatus(ok bool) string {
	if ok {
		return "ok"
	}
	return "error"
}

func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	// Build a lookup set from the configured origins.
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[strings.TrimSpace(o)] = struct{}{}
	}

	return cors.New(cors.Config{
		// AllowOriginFunc is called for every request.
		// It returns true when the origin is allowed.
		// We check the whitelist first; if the origin is not listed we still
		// allow it so that engineers accessing via Tailscale / LAN IPs are not
		// blocked. For a locked-down production deployment, remove the final
		// "return true" and manage origins via CORS_ALLOWED_ORIGINS.
		AllowOriginFunc: func(origin string) bool {
			if _, ok := originSet[origin]; ok {
				return true
			}
			// Allow any origin from the same LAN / Tailscale network.
			// Remove this line if strict origin enforcement is required.
			return true
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Request-ID", "X-Trace-ID", "X-Correlation-ID"},
		ExposeHeaders:    []string{"X-Request-ID", "X-Trace-ID", "X-Correlation-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
