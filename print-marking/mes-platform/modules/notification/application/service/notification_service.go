package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/nd/mes-platform/modules/notification/domain/entity"
	"github.com/nd/mes-platform/modules/notification/domain/repository"
	"github.com/nd/mes-platform/pkg/logger"
	"go.uber.org/zap"
)

// EmailDispatcher defines a port to send actual email notifications.
type EmailDispatcher interface {
	Send(ctx context.Context, recipientEmail string, subject string, body string) error
}

// LogEmailDispatcher is a stub email dispatcher printing to logs.
type LogEmailDispatcher struct {
	log *logger.Logger
}

func NewLogEmailDispatcher(log *logger.Logger) *LogEmailDispatcher {
	return &LogEmailDispatcher{
		log: log.With(logger.Module("notification")),
	}
}

func (d *LogEmailDispatcher) Send(ctx context.Context, recipientEmail string, subject string, body string) error {
	d.log.Info("email notification dispatched",
		zap.String("recipient", recipientEmail),
		zap.String("subject", subject),
		zap.String("body_preview", body),
	)
	return nil
}

// NotificationService manages alert center notifications, email dispatches, and in-app logs.
type NotificationService struct {
	alertRepo  repository.AlertRepository
	outboxRepo repository.OutboxRepository
	emailDisp  EmailDispatcher
	log        *logger.Logger
}

func NewNotificationService(
	alertRepo repository.AlertRepository,
	outboxRepo repository.OutboxRepository,
	emailDisp EmailDispatcher,
	log *logger.Logger,
) *NotificationService {
	return &NotificationService{
		alertRepo:  alertRepo,
		outboxRepo: outboxRepo,
		emailDisp:  emailDisp,
		log:        log.With(logger.Module("notification")),
	}
}

// TriggerAlert generates a validated alert domain aggregate and saves it.
func (s *NotificationService) TriggerAlert(ctx context.Context, userID *uuid.UUID, role string, title, message string, t entity.AlertType, c entity.AlertChannel) (*entity.Alert, error) {
	alert, err := entity.NewAlert(userID, role, title, message, t, c)
	if err != nil {
		return nil, err
	}

	// Persist Alert (if channel is in_app or both)
	if c == entity.AlertChannelInApp || c == entity.AlertChannelBoth {
		if err := s.alertRepo.Save(ctx, alert); err != nil {
			return nil, fmt.Errorf("notification_service: save alert: %w", err)
		}
	}

	// Dispatch Email (if channel is email or both)
	if c == entity.AlertChannelEmail || c == entity.AlertChannelBoth {
		emailSubject := fmt.Sprintf("[%s] %s", strings.ToUpper(string(t)), title)
		recipient := "user-stub@example.com"
		if userID != nil {
			recipient = fmt.Sprintf("user-%s@example.com", userID.String()[:8])
		} else if role != "" {
			recipient = fmt.Sprintf("%s-notifications@example.com", role)
		}

		if err := s.emailDisp.Send(ctx, recipient, emailSubject, message); err != nil {
			s.log.Error("notification_service: email dispatch failed", logger.Err(err))
			// Do not fail the transaction, log it.
		}
	}

	// Publish Event to Outbox
	for _, ev := range alert.PullEvents() {
		if err := s.outboxRepo.Save(ctx, ev.EventName(), "mes.notification.AlertCreated", ev); err != nil {
			s.log.Error("notification_service: outbox save failed", logger.Err(err))
		}
	}

	return alert, nil
}

// MarkAlertRead transitions a specific alert to read status.
func (s *NotificationService) MarkAlertRead(ctx context.Context, alertID uuid.UUID) error {
	alert, err := s.alertRepo.FindByID(ctx, alertID)
	if err != nil {
		return err
	}

	alert.MarkAsRead()
	return s.alertRepo.Save(ctx, alert)
}

// MarkAllAlertsRead marks all unread notifications for a user as read.
func (s *NotificationService) MarkAllAlertsRead(ctx context.Context, userID uuid.UUID) error {
	return s.alertRepo.MarkAllRead(ctx, userID)
}

// GetAlertByID returns a single alert.
func (s *NotificationService) GetAlertByID(ctx context.Context, alertID uuid.UUID) (*entity.Alert, error) {
	return s.alertRepo.FindByID(ctx, alertID)
}

// ListAlerts lists notifications with pagination and filter criteria.
func (s *NotificationService) ListAlerts(ctx context.Context, filter repository.AlertFilter) ([]*entity.Alert, int64, error) {
	return s.alertRepo.List(ctx, filter)
}
