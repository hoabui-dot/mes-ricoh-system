// Package main is the entry point for the MES Platform.
// It initialises the application and starts the HTTP server.
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/nd/mes-platform/internal/bootstrap"
	"github.com/nd/mes-platform/pkg/logger"
)

// @title           MES Platform API
// @version         1.0
// @description     Manufacturing Execution System — Enterprise Factory Application
// @termsOfService  http://example.com/terms/

// @contact.name   ND Factory
// @contact.email  support@nd-factory.com

// @license.name  Proprietary
// @license.url   http://example.com/license

// @host      localhost:8080
// @BasePath  /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and the JWT token.

func main() {
	app, err := bootstrap.New()
	if err != nil {
		// Logger may not be available yet — write directly to stderr.
		_, _ = os.Stderr.WriteString("Failed to initialise MES Platform: " + err.Error() + "\n")
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := app.Start(ctx); err != nil {
		app.Log().Error("server exited with error", logger.Err(err))
	}

	app.Shutdown()
}
