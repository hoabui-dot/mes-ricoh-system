// Package route registers the Identity module's HTTP routes on the Gin engine.
package route

import (
	"github.com/gin-gonic/gin"
	"github.com/nd/mes-platform/modules/identity/presentation/handler"
	"github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/redis"
	"github.com/nd/mes-platform/shared/middleware"
)

// Register mounts all identity routes under /api/v1.
func Register(
	router *gin.RouterGroup,
	authHandler *handler.AuthHandler,
	userHandler *handler.UserHandler,
	roleHandler *handler.RoleHandler,
	jwtManager *jwt.Manager,
	redisClient *redis.Client,
	authRPM, defaultRPM int,
) {
	auth := router.Group("/auth")
	{
		// Public endpoints — rate-limited but not authenticated.
		authLimited := auth.Use(middleware.RateLimit(redisClient, "auth", authRPM))
		authLimited.POST("/register", authHandler.Register)
		authLimited.POST("/login", authHandler.Login)
		authLimited.POST("/refresh", authHandler.Refresh)
		authLimited.POST("/forgot-password", authHandler.ForgotPassword)
		authLimited.POST("/reset-password", func(c *gin.Context) {
			// Placeholder until Phase 1 reset token lookup is implemented.
			c.JSON(501, gin.H{"message": "not implemented"})
		})
	}

	// Protected endpoints — require valid JWT.
	protected := router.Group("").Use(middleware.Authenticate(jwtManager))

	// Auth profile routes
	protected.POST("/auth/logout", authHandler.Logout)
	protected.GET("/auth/me", authHandler.Me)
	protected.PUT("/auth/profile", authHandler.UpdateProfile)
	protected.POST("/auth/change-password", authHandler.ChangePassword)

	// User management
	protected.GET("/users", userHandler.ListUsers)
	protected.GET("/users/:id", userHandler.GetUser)
	protected.PATCH("/users/:id/status", userHandler.UpdateUserStatus)
	protected.POST("/users/:id/roles", userHandler.AssignUserRoles)
	protected.PUT("/users/:id/roles", userHandler.AssignUserRoles)
	protected.DELETE("/users/:id/roles/:roleId", userHandler.RemoveUserRole)

	// Role management
	protected.GET("/roles", roleHandler.ListRoles)
	protected.GET("/roles/:id", roleHandler.GetRole)
	protected.POST("/roles", roleHandler.CreateRole)
	protected.PUT("/roles/:id", roleHandler.UpdateRole)
	protected.DELETE("/roles/:id", roleHandler.DeleteRole)

	// Permission management
	protected.GET("/permissions", roleHandler.ListPermissions)
	protected.POST("/permissions", roleHandler.CreatePermission)
}
