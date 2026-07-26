package consumer

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/nd/mes-platform/modules/notification/application/service"
	"github.com/nd/mes-platform/modules/notification/domain/entity"
	"github.com/nd/mes-platform/pkg/logger"
	"github.com/nd/mes-platform/pkg/rabbitmq"
	"go.uber.org/zap"
)

type EventConsumer struct {
	conn       *rabbitmq.Connection
	notifySvc  *service.NotificationService
	log        *logger.Logger
	queueName  string
}

func NewEventConsumer(
	conn *rabbitmq.Connection,
	notifySvc *service.NotificationService,
	log *logger.Logger,
) *EventConsumer {
	return &EventConsumer{
		conn:      conn,
		notifySvc: notifySvc,
		log:       log.With(logger.Module("notification")),
		queueName: "mes.notification_queue",
	}
}

// Start declares the queue, binds it to interest events, and begins consuming messages.
func (c *EventConsumer) Start(ctx context.Context) error {
	// Declare the queue
	// We want to bind to multiple events. Let's declare queue first then bind each routing key manually.
	// declare exchange is already done inside rabbitmq.New()
	ch, err := c.conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()

	if _, err := ch.QueueDeclare(c.queueName, true, false, false, false, nil); err != nil {
		return fmt.Errorf("notification_consumer: declare queue %q: %w", c.queueName, err)
	}

	// Dynamic routing keys to bind to this queue
	routingKeys := []string{
		"mes.identity.UserRegistered",
		"mes.workforce.WorkerCreated",
		"mes.planning.WorkerAssignedToShift",
		"mes.assignment.AssignmentProposed",
	}

	for _, rk := range routingKeys {
		if err := ch.QueueBind(c.queueName, rk, c.conn.Exchange(), false, nil); err != nil {
			return fmt.Errorf("notification_consumer: bind key %q: %w", rk, err)
		}
	}

	consumer := rabbitmq.NewConsumer(c.conn)

	go func() {
		c.log.Info("starting notification RabbitMQ consumer loop...")
		err := consumer.Consume(ctx, c.queueName, 10, c.handleDelivery)
		if err != nil {
			c.log.Error("notification_consumer: consumer loop failed", logger.Err(err))
		}
	}()

	return nil
}

func (c *EventConsumer) handleDelivery(ctx context.Context, del amqp.Delivery) error {
	c.log.Info("notification_consumer: received event", zap.String("routing_key", del.RoutingKey))

	var raw map[string]any
	if err := json.Unmarshal(del.Body, &raw); err != nil {
		c.log.Error("notification_consumer: failed to unmarshal raw payload", logger.Err(err))
		return nil // return nil so message is acknowledged (we can't handle malformed messages anyway)
	}

	eventName, _ := raw["event_name"].(string)
	if eventName == "" {
		eventName = del.RoutingKey
	}

	switch eventName {
	case "mes.identity.UserRegistered":
		var ev struct {
			UserID   uuid.UUID `json:"user_id"`
			Username string    `json:"username"`
			Email    string    `json:"email"`
		}
		if err := json.Unmarshal(del.Body, &ev); err != nil {
			return err
		}
		_, err := c.notifySvc.TriggerAlert(ctx, &ev.UserID, "", "Welcome to MES Platform",
			fmt.Sprintf("Hello %s! Your account has been successfully registered. Email: %s", ev.Username, ev.Email),
			entity.AlertTypeInfo, entity.AlertChannelEmail)
		return err

	case "mes.workforce.WorkerCreated":
		var ev struct {
			WorkerID     uuid.UUID `json:"worker_id"`
			EmployeeCode string    `json:"employee_code"`
			Email        string    `json:"email"`
		}
		if err := json.Unmarshal(del.Body, &ev); err != nil {
			return err
		}
		_, err := c.notifySvc.TriggerAlert(ctx, &ev.WorkerID, "", "New Worker Setup Required",
			fmt.Sprintf("Worker record created for employee code: %s. Profile configuration setup required.", ev.EmployeeCode),
			entity.AlertTypeInfo, entity.AlertChannelInApp)
		return err

	case "mes.planning.WorkerAssignedToShift":
		var ev struct {
			ShiftID  uuid.UUID `json:"shift_id"`
			WorkerID uuid.UUID `json:"worker_id"`
			Role     string    `json:"role"`
		}
		if err := json.Unmarshal(del.Body, &ev); err != nil {
			return err
		}
		_, err := c.notifySvc.TriggerAlert(ctx, &ev.WorkerID, "", "Shift Assignment Alert",
			fmt.Sprintf("You have been assigned to Shift %s in the role of %s. Please review scheduling calendars.", ev.ShiftID, ev.Role),
			entity.AlertTypeInfo, entity.AlertChannelBoth)
		return err

	case "mes.assignment.AssignmentProposed":
		var ev struct {
			AssignmentID uuid.UUID `json:"assignment_id"`
			WorkOrderID  uuid.UUID `json:"work_order_id"`
			OperationID  uuid.UUID `json:"operation_id"`
			Revision     int       `json:"revision"`
			Score        float64   `json:"score"`
		}
		if err := json.Unmarshal(del.Body, &ev); err != nil {
			return err
		}
		// Send manager-targeted notification
		_, err := c.notifySvc.TriggerAlert(ctx, nil, "manager", "New Work Assignment Proposal",
			fmt.Sprintf("Assignment proposal %s has been created for work order %s (operation %s, revision %d) with average suitability score %0.2f. Review approval required.",
				ev.AssignmentID, ev.WorkOrderID, ev.OperationID, ev.Revision, ev.Score),
			entity.AlertTypeWarning, entity.AlertChannelInApp)
		return err

	default:
		c.log.Warn("notification_consumer: unhandled event type", zap.String("event_name", eventName))
	}

	return nil
}
