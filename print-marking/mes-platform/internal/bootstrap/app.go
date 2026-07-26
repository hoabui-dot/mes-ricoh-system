// Package bootstrap wires all dependencies together using dependency injection.
// This is the composition root — no other package should import from this package.
package bootstrap

import (
	"context"

	"github.com/nd/mes-platform/internal/server"
	identitysvc "github.com/nd/mes-platform/modules/identity/application/service"
	identityentity "github.com/nd/mes-platform/modules/identity/domain/entity"
	identitypersistence "github.com/nd/mes-platform/modules/identity/infrastructure/persistence"
	"github.com/nd/mes-platform/modules/identity/infrastructure/rbac"
	identityhandler "github.com/nd/mes-platform/modules/identity/presentation/handler"
	identityroute "github.com/nd/mes-platform/modules/identity/presentation/route"
	workforcesvc "github.com/nd/mes-platform/modules/workforce/application/service"
	workforcepersistence "github.com/nd/mes-platform/modules/workforce/infrastructure/persistence"
	workforcehandler "github.com/nd/mes-platform/modules/workforce/presentation/handler"
	workforceroute "github.com/nd/mes-platform/modules/workforce/presentation/route"
	planningsvc "github.com/nd/mes-platform/modules/planning/application/service"
	planningpersistence "github.com/nd/mes-platform/modules/planning/infrastructure/persistence"
	planninghandler "github.com/nd/mes-platform/modules/planning/presentation/handler"
	planningroute "github.com/nd/mes-platform/modules/planning/presentation/route"
	productionsvc "github.com/nd/mes-platform/modules/production/application/service"
	productiongateway "github.com/nd/mes-platform/modules/production/infrastructure/gateway"
	productionpersistence "github.com/nd/mes-platform/modules/production/infrastructure/persistence"
	productionhandler "github.com/nd/mes-platform/modules/production/presentation/handler"
	productionroute "github.com/nd/mes-platform/modules/production/presentation/route"
	assignmentsvc "github.com/nd/mes-platform/modules/assignment/application/service"
	assignmentpersistence "github.com/nd/mes-platform/modules/assignment/infrastructure/persistence"
	assignmenthandler "github.com/nd/mes-platform/modules/assignment/presentation/handler"
	assignmentroute "github.com/nd/mes-platform/modules/assignment/presentation/route"
	projectionbuilder "github.com/nd/mes-platform/modules/projection/application/builder"
	projectionservice "github.com/nd/mes-platform/modules/projection/application/service"
	projectionpersistence "github.com/nd/mes-platform/modules/projection/infrastructure/persistence"
	projectionhandler "github.com/nd/mes-platform/modules/projection/presentation/handler"
	projectionroute "github.com/nd/mes-platform/modules/projection/presentation/route"
	notificationsvc "github.com/nd/mes-platform/modules/notification/application/service"
	notificationconsumer "github.com/nd/mes-platform/modules/notification/application/consumer"
	notificationpersistence "github.com/nd/mes-platform/modules/notification/infrastructure/persistence"
	notificationhandler "github.com/nd/mes-platform/modules/notification/presentation/handler"
	notificationroute "github.com/nd/mes-platform/modules/notification/presentation/route"
	auditsvc "github.com/nd/mes-platform/modules/audit/application/service"
	auditpersistence "github.com/nd/mes-platform/modules/audit/infrastructure/persistence"
	auditplugin "github.com/nd/mes-platform/modules/audit/infrastructure/plugin"
	audithandler "github.com/nd/mes-platform/modules/audit/presentation/handler"
	auditroute "github.com/nd/mes-platform/modules/audit/presentation/route"
	"time"
	jwtpkg "github.com/nd/mes-platform/pkg/jwt"
	"github.com/nd/mes-platform/pkg/logger"
	postgresPkg "github.com/nd/mes-platform/pkg/postgres"
	rabbitmqpkg "github.com/nd/mes-platform/pkg/rabbitmq"
	redispkg "github.com/nd/mes-platform/pkg/redis"
	"github.com/nd/mes-platform/shared/config"
	"github.com/nd/mes-platform/shared/outbox"
)

// App is the top-level application container holding all wired dependencies.
type App struct {
	cfg    *config.Config
	log    *logger.Logger
	server *server.Server
	db     *postgresPkg.DB
	redis  *redispkg.Client
	rmq    *rabbitmqpkg.Connection
}

// New loads configuration, creates infrastructure clients, wires all module
// dependencies, and returns a fully initialised App.
func New() (*App, error) {
	// ── 1. Configuration ─────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	// ── 2. Logger ─────────────────────────────────────────────────────────────
	log, err := logger.New(cfg.Log.Level, cfg.Log.Format)
	if err != nil {
		return nil, err
	}

	// ── 3. PostgreSQL ─────────────────────────────────────────────────────────
	db, err := postgresPkg.New(postgresPkg.Config{
		Host:            cfg.Database.Host,
		Port:            cfg.Database.Port,
		User:            cfg.Database.User,
		Password:        cfg.Database.Password,
		DBName:          cfg.Database.DBName,
		SSLMode:         cfg.Database.SSLMode,
		MaxOpenConns:    cfg.Database.MaxOpenConns,
		MaxIdleConns:    cfg.Database.MaxIdleConns,
		ConnMaxLifetime: cfg.Database.ConnMaxLifetime,
	})
	if err != nil {
		return nil, err
	}

	// ── 4. Redis ──────────────────────────────────────────────────────────────
	redisClient, err := redispkg.New(redispkg.Config{
		Host:     cfg.Redis.Host,
		Port:     cfg.Redis.Port,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
		PoolSize: cfg.Redis.PoolSize,
	})
	if err != nil {
		return nil, err
	}

	// ── 5. RabbitMQ ───────────────────────────────────────────────────────────
	rmqConn, err := rabbitmqpkg.New(rabbitmqpkg.Config{
		Host:     cfg.RabbitMQ.Host,
		Port:     cfg.RabbitMQ.Port,
		User:     cfg.RabbitMQ.User,
		Password: cfg.RabbitMQ.Password,
		VHost:    cfg.RabbitMQ.VHost,
		Exchange: cfg.RabbitMQ.Exchange,
	})
	if err != nil {
		log.Warn("RabbitMQ unavailable — outbox publishing will retry", logger.Err(err))
		rmqConn = nil
	}

	// ── 6. JWT Manager ────────────────────────────────────────────────────────
	jwtManager, err := jwtpkg.NewManager(jwtpkg.Config{
		Secret:              cfg.JWT.Secret,
		AccessExpiryMinutes: cfg.JWT.AccessExpiryMinutes,
		RefreshExpiryDays:   cfg.JWT.RefreshExpiryDays,
		Issuer:              cfg.JWT.Issuer,
		Audience:            cfg.JWT.Audience,
	})
	if err != nil {
		return nil, err
	}

	// ── 7. Casbin RBAC ────────────────────────────────────────────────────────
	enforcer, err := rbac.NewEnforcer(db.DB)
	if err != nil {
		return nil, err
	}
	if err := enforcer.SeedDefaultPolicies(); err != nil {
		log.Warn("casbin seed failed (may already exist)", logger.Err(err))
	}

	// ── 8. Identity Module ────────────────────────────────────────────────────
	userRepo := identitypersistence.NewGormUserRepository(db.DB)
	roleRepo := identitypersistence.NewGormRoleRepository(db.DB)
	permRepo := identitypersistence.NewGormPermissionRepository(db.DB)
	tokenRepo := identitypersistence.NewGormRefreshTokenRepository(db.DB)
	userRoleRepo := identitypersistence.NewGormUserRoleRepository(db.DB)
	identityOutboxRepo := identitypersistence.NewGormOutboxRepository(db.DB)

	passwordPolicy := identityentity.PasswordPolicy{
		MinLength:        cfg.Password.MinLength,
		RequireUppercase: cfg.Password.RequireUppercase,
		RequireLowercase: cfg.Password.RequireLowercase,
		RequireNumber:    cfg.Password.RequireNumber,
		RequireSpecial:   cfg.Password.RequireSpecial,
	}

	identityService := identitysvc.NewIdentityService(
		userRepo,
		roleRepo,
		permRepo,
		tokenRepo,
		userRoleRepo,
		identityOutboxRepo,
		enforcer,
		jwtManager,
		passwordPolicy,
		log,
	)

	authHandler := identityhandler.NewAuthHandler(identityService)
	userHandler := identityhandler.NewUserHandler(identityService)
	roleHandler := identityhandler.NewRoleHandler(identityService)

	// ── 8.1. Workforce Module ──────────────────────────────────────────────────
	workforceWorkerRepo := workforcepersistence.NewGormWorkerRepository(db.DB)
	workforceOrgRepo := workforcepersistence.NewGormOrgRepository(db.DB)
	workforceSkillRepo := workforcepersistence.NewGormSkillRepository(db.DB)
	workforceCertRepo := workforcepersistence.NewGormCertificateRepository(db.DB)
	workforceOutboxRepo := workforcepersistence.NewGormOutboxRepository(db.DB)

	workforceService := workforcesvc.NewWorkforceService(
		workforceWorkerRepo,
		workforceOrgRepo,
		workforceSkillRepo,
		workforceCertRepo,
		workforceOutboxRepo,
		log,
	)

	workforceHandlerInstance := workforcehandler.NewWorkforceHandler(workforceService, enforcer)

	// ── 8.2. Planning Module ───────────────────────────────────────────────────
	planningShiftRepo := planningpersistence.NewGormShiftRepository(db.DB)
	planningTemplateRepo := planningpersistence.NewGormShiftTemplateRepository(db.DB)
	planningHolidayRepo := planningpersistence.NewGormHolidayRepository(db.DB)
	planningLeaveRepo := planningpersistence.NewGormLeaveRepository(db.DB)
	planningOvertimeRepo := planningpersistence.NewGormOvertimeRepository(db.DB)
	planningOutboxRepo := planningpersistence.NewGormOutboxRepository(db.DB)

	planningService := planningsvc.NewPlanningService(
		db.DB,
		planningShiftRepo,
		planningTemplateRepo,
		planningHolidayRepo,
		planningLeaveRepo,
		planningOvertimeRepo,
		planningOutboxRepo,
		log,
	)

	planningHandlerInstance := planninghandler.NewPlanningHandler(planningService, enforcer)

	// ── 8.3. Production Module ─────────────────────────────────────────────────
	productionOrderRepo := productionpersistence.NewGormProductionOrderRepository(db.DB)
	productionWorkRepo := productionpersistence.NewGormWorkOrderRepository(db.DB)
	productionRoutingRepo := productionpersistence.NewGormRoutingRepository(db.DB)
	productionEventRepo := productionpersistence.NewGormProductionOrderEventRepository(db.DB)
	productionOutboxRepo := productionpersistence.NewGormOutboxRepository(db.DB)
	productionWorkflowRepo := productionpersistence.NewGormWorkflowRepository(db.DB)
	productionPlanRepo := productionpersistence.NewGormDispatchPlanRepository(db.DB)
	productionTimelineRepo := productionpersistence.NewGormWorkOrderTimelineRepository(db.DB)
	gatewayClient := productiongateway.NewGatewayClient(cfg.Gateway.URL)

	productionService := productionsvc.NewProductionService(
		productionOrderRepo,
		productionWorkRepo,
		productionRoutingRepo,
		productionEventRepo,
		productionOutboxRepo,
		gatewayClient,
		productionPlanRepo,
		productionTimelineRepo,
		productionWorkflowRepo,
		log,
	)

	workflowService := productionsvc.NewWorkflowService(
		productionWorkflowRepo,
		productionOutboxRepo,
		log,
	)

	productionHandlerInstance := productionhandler.NewProductionHandler(productionService)
	workflowHandlerInstance := productionhandler.NewWorkflowHandler(workflowService, enforcer)

	// ── 8.4. Assignment Module ─────────────────────────────────────────────────
	assignmentRepo := assignmentpersistence.NewGormAssignmentRepository(db.DB)
	assignmentOutboxRepo := assignmentpersistence.NewGormOutboxRepository(db.DB)

	workerQueryAdapter := NewWorkerQueryAdapter(workforceWorkerRepo)
	operationQueryAdapter := NewOperationQueryAdapter(productionRoutingRepo)

	assignmentService := assignmentsvc.NewAssignmentService(
		assignmentRepo,
		assignmentOutboxRepo,
		workerQueryAdapter,
		operationQueryAdapter,
		log,
	)

	assignmentHandlerInstance := assignmenthandler.NewAssignmentHandler(assignmentService)

	// ── 8.5. Projection Module ─────────────────────────────────────────────────
	projDashboardRepo := projectionpersistence.NewGormDashboardRepository(db.DB)
	projOrderRepo := projectionpersistence.NewGormOrderStatsRepository(db.DB)
	projWorkerRepo := projectionpersistence.NewGormWorkerStatsRepository(db.DB)

	projBuilder := projectionbuilder.NewProjectionBuilder(db.DB, projDashboardRepo, projOrderRepo, projWorkerRepo, log)
	projService := projectionservice.NewDashboardService(projDashboardRepo, projOrderRepo, projWorkerRepo, projBuilder, log)
	projHandlerInstance := projectionhandler.NewProjectionHandler(projService)

	// ── 8.6. Notification Module ───────────────────────────────────────────────
	notifyAlertRepo := notificationpersistence.NewGormAlertRepository(db.DB)
	notifyOutboxRepo := notificationpersistence.NewGormOutboxRepository(db.DB)
	emailDispatcher := notificationsvc.NewLogEmailDispatcher(log)

	notifyService := notificationsvc.NewNotificationService(
		notifyAlertRepo,
		notifyOutboxRepo,
		emailDispatcher,
		log,
	)

	notifyHandlerInstance := notificationhandler.NewNotificationHandler(notifyService)

	// ── 8.7. Audit Module ──────────────────────────────────────────────────────
	auditRepo := auditpersistence.NewGormAuditRepository(db.DB)
	auditService := auditsvc.NewAuditService(auditRepo, log)
	auditHandlerInstance := audithandler.NewAuditHandler(auditService)

	// Register GORM Change Auditing Plugin to capture DB writes automatically
	_ = db.DB.Use(auditplugin.NewAuditPlugin(auditRepo))


	// ── 9. HTTP Server ────────────────────────────────────────────────────────
	srv := server.New(cfg, log, db, redisClient)
	v1 := srv.V1()
	identityroute.Register(v1, authHandler, userHandler, roleHandler,
		jwtManager, redisClient,
		cfg.RateLimit.AuthRequestsPerMinute,
		cfg.RateLimit.RequestsPerMinute,
	)
	workforceroute.Register(v1, workforceHandlerInstance, jwtManager)
	planningroute.Register(v1, planningHandlerInstance, jwtManager)
	productionroute.Register(v1, productionHandlerInstance, workflowHandlerInstance, jwtManager)
	assignmentroute.Register(v1, assignmentHandlerInstance, jwtManager)
	projectionroute.Register(v1, projHandlerInstance, jwtManager)
	notificationroute.Register(v1, notifyHandlerInstance, jwtManager)
	auditroute.Register(v1, auditHandlerInstance, jwtManager)

	// ── 10. Outbox Worker (Identity, Workforce, & Planning) ───────────────────
	if rmqConn != nil {
		publisher := rabbitmqpkg.NewPublisher(rmqConn)
		
		// Identity outbox worker
		identityOutbox := outbox.NewGormRepository(db.DB, "identity_outbox_events")
		identityOutboxWorker := outbox.NewWorker(identityOutbox, publisher, log, outbox.WorkerConfig{
			PollInterval: 0, // uses default
			BatchSize:    cfg.Outbox.BatchSize,
			TableName:    "identity_outbox_events",
		})
		go identityOutboxWorker.Run(context.Background())

		// Workforce outbox worker
		workforceOutbox := outbox.NewGormRepository(db.DB, "workforce_outbox_events")
		workforceOutboxWorker := outbox.NewWorker(workforceOutbox, publisher, log, outbox.WorkerConfig{
			PollInterval: 0, // uses default
			BatchSize:    cfg.Outbox.BatchSize,
			TableName:    "workforce_outbox_events",
		})
		go workforceOutboxWorker.Run(context.Background())

		// Planning outbox worker
		planningOutbox := outbox.NewGormRepository(db.DB, "planning_outbox_events")
		planningOutboxWorker := outbox.NewWorker(planningOutbox, publisher, log, outbox.WorkerConfig{
			PollInterval: 0, // uses default
			BatchSize:    cfg.Outbox.BatchSize,
			TableName:    "planning_outbox_events",
		})
		go planningOutboxWorker.Run(context.Background())

		// Production outbox worker
		productionOutbox := outbox.NewGormRepository(db.DB, "production_outbox_events")
		productionOutboxWorker := outbox.NewWorker(productionOutbox, publisher, log, outbox.WorkerConfig{
			PollInterval: 0, // uses default
			BatchSize:    cfg.Outbox.BatchSize,
			TableName:    "production_outbox_events",
		})
		go productionOutboxWorker.Run(context.Background())

		// Assignment outbox worker
		assignmentOutbox := outbox.NewGormRepository(db.DB, "assignment_outbox_events")
		assignmentOutboxWorker := outbox.NewWorker(assignmentOutbox, publisher, log, outbox.WorkerConfig{
			PollInterval: 0, // uses default
			BatchSize:    cfg.Outbox.BatchSize,
			TableName:    "assignment_outbox_events",
		})
		go assignmentOutboxWorker.Run(context.Background())

		// Notification outbox worker
		notificationOutbox := outbox.NewGormRepository(db.DB, "notification_outbox_events")
		notificationOutboxWorker := outbox.NewWorker(notificationOutbox, publisher, log, outbox.WorkerConfig{
			PollInterval: 0,
			BatchSize:    cfg.Outbox.BatchSize,
			TableName:    "notification_outbox_events",
		})
		go notificationOutboxWorker.Run(context.Background())

		// Start RabbitMQ Event Consumer for notifications
		eventConsumer := notificationconsumer.NewEventConsumer(rmqConn, notifyService, log)
		if err := eventConsumer.Start(context.Background()); err != nil {
			log.Error("failed to start notification event consumer", logger.Err(err))
		}
	}

	// ── 11. Projection Periodic Rebuild ───────────────────────────────────────
	// Rebuild dashboard snapshot every 60 seconds and push to SSE subscribers.
	projService.StartPeriodicRebuild(context.Background(), 60*time.Second)

	// Suppress unused variable warnings
	_ = enforcer

	return &App{
		cfg:    cfg,
		log:    log,
		server: srv,
		db:     db,
		redis:  redisClient,
		rmq:    rmqConn,
	}, nil
}

// Start runs the application, blocking until ctx is cancelled.
func (a *App) Start(ctx context.Context) error {
	return a.server.Start(ctx)
}

// Shutdown gracefully releases all resources.
func (a *App) Shutdown() {
	a.log.Info("shutting down application...")
	if a.rmq != nil {
		_ = a.rmq.Close()
	}
	if err := a.redis.Close(); err != nil {
		a.log.Error("redis close error", logger.Err(err))
	}
	if err := a.db.Close(); err != nil {
		a.log.Error("postgres close error", logger.Err(err))
	}
	_ = a.log.Sync()
}

// Log returns the application logger.
func (a *App) Log() *logger.Logger {
	return a.log
}
