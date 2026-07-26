// Package rabbitmq provides a resilient RabbitMQ connection and channel manager.
// It abstracts AMQP topology setup (exchange, queue, binding) and provides
// typed Publisher and Consumer interfaces.
package rabbitmq

import (
	"context"
	"fmt"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Config holds RabbitMQ connection settings.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	VHost    string
	Exchange string
}

// Connection wraps amqp.Connection with topology helpers.
type Connection struct {
	conn     *amqp.Connection
	exchange string
}

// New creates and validates a RabbitMQ connection, then declares the
// topic exchange used by all MES domain events.
func New(cfg Config) (*Connection, error) {
	url := fmt.Sprintf("amqp://%s:%s@%s:%d/%s",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.VHost)

	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("rabbitmq: dial failed: %w", err)
	}

	c := &Connection{conn: conn, exchange: cfg.Exchange}

	// Declare the MES topic exchange.
	if err := c.declareExchange(); err != nil {
		conn.Close()
		return nil, err
	}

	return c, nil
}

// Close gracefully closes the AMQP connection.
func (c *Connection) Close() error {
	if c.conn != nil && !c.conn.IsClosed() {
		return c.conn.Close()
	}
	return nil
}

// IsConnected returns true when the underlying AMQP connection is open.
func (c *Connection) IsConnected() bool {
	return c.conn != nil && !c.conn.IsClosed()
}

// Exchange returns the configured exchange name.
func (c *Connection) Exchange() string {
	return c.exchange
}

// Channel opens a new AMQP channel. Callers are responsible for closing it.
func (c *Connection) Channel() (*amqp.Channel, error) {
	ch, err := c.conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("rabbitmq: open channel failed: %w", err)
	}
	return ch, nil
}

// declareExchange ensures the MES topic exchange exists on the broker.
func (c *Connection) declareExchange() error {
	ch, err := c.conn.Channel()
	if err != nil {
		return fmt.Errorf("rabbitmq: open channel for exchange declaration: %w", err)
	}
	defer ch.Close()

	return ch.ExchangeDeclare(
		c.exchange, // name
		"topic",    // kind
		true,       // durable
		false,      // auto-deleted
		false,      // internal
		false,      // no-wait
		nil,        // args
	)
}

// DeclareQueue declares a durable queue and binds it to the exchange with the given routing key.
func (c *Connection) DeclareQueue(name, routingKey string) error {
	ch, err := c.conn.Channel()
	if err != nil {
		return fmt.Errorf("rabbitmq: open channel for queue declaration: %w", err)
	}
	defer ch.Close()

	if _, err := ch.QueueDeclare(name, true, false, false, false, nil); err != nil {
		return fmt.Errorf("rabbitmq: declare queue %q: %w", name, err)
	}

	if err := ch.QueueBind(name, routingKey, c.exchange, false, nil); err != nil {
		return fmt.Errorf("rabbitmq: bind queue %q with key %q: %w", name, routingKey, err)
	}

	return nil
}

// ─── Publisher ─────────────────────────────────────────────────────────────────

// Publisher publishes domain events to the MES exchange.
type Publisher struct {
	conn *Connection
}

// NewPublisher creates a Publisher from an existing Connection.
func NewPublisher(conn *Connection) *Publisher {
	return &Publisher{conn: conn}
}

// Publish sends a JSON-encoded message to the exchange with the given routing key.
// Every published message is marked as persistent (delivery mode 2).
func (p *Publisher) Publish(ctx context.Context, routingKey string, body []byte) error {
	ch, err := p.conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()

	return ch.PublishWithContext(ctx,
		p.conn.exchange, // exchange
		routingKey,      // routing key
		false,           // mandatory
		false,           // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

// MessageHandler is the function signature for consuming messages.
type MessageHandler func(ctx context.Context, delivery amqp.Delivery) error

// Consumer subscribes to a queue and calls the handler for each message.
type Consumer struct {
	conn *Connection
}

// NewConsumer creates a Consumer from an existing Connection.
func NewConsumer(conn *Connection) *Consumer {
	return &Consumer{conn: conn}
}

// Consume starts consuming messages from the given queue.
// Messages are manually acknowledged after the handler returns nil.
// On handler error, messages are negatively acknowledged with requeue=false.
func (c *Consumer) Consume(ctx context.Context, queueName string, prefetch int, handler MessageHandler) error {
	ch, err := c.conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()

	if err := ch.Qos(prefetch, 0, false); err != nil {
		return fmt.Errorf("rabbitmq: set QoS failed: %w", err)
	}

	msgs, err := ch.Consume(queueName, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("rabbitmq: consume %q failed: %w", queueName, err)
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-msgs:
			if !ok {
				return fmt.Errorf("rabbitmq: channel closed for queue %q", queueName)
			}
			if err := handler(ctx, msg); err != nil {
				_ = msg.Nack(false, false)
				continue
			}
			_ = msg.Ack(false)
		}
	}
}
