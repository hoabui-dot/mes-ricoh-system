using Microsoft.Extensions.Logging;
using ND.StationGateway.Application.Interfaces;
using ND.StationGateway.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.StationGateway.Application.Commands;

/// <summary>
/// Command payload for a production order received from Factory Gateway via HTTP.
/// </summary>
public record ProcessGatewayOrderCommand(
    string RequestId,   // = event_id from UnifiedEvent — used as idempotency key
    string Source,      // = "FACTORY_GATEWAY" or edge_id
    string PayloadJson  // = full UnifiedEvent JSON body
);

/// <summary>
/// Handles an inbound production order from Factory Gateway.
///
/// Atomically:
///   1. GatewayRequest — persists the raw request for audit
///   2. GatewayOutboxEvent — queues the event for RabbitMQ dispatch
///
/// The OutboxProcessorWorker picks up PENDING events and publishes them
/// to the RabbitMQ <c>station.events</c> exchange with routing key
/// <c>mqtt.MqttMessage.MqttMessageReceived</c> (kept for Job Engine backward-compat).
/// </summary>
public sealed class ProcessGatewayOrderHandler
{
    private readonly IGatewayRequestRepository _requestRepository;
    private readonly IGatewayOutboxRepository _outboxRepository;
    private readonly IIdempotencyService _idempotency;
    private readonly ITransactionalUnitOfWork _unitOfWork;
    private readonly ILogger<ProcessGatewayOrderHandler> _logger;

    public ProcessGatewayOrderHandler(
        IGatewayRequestRepository requestRepository,
        IGatewayOutboxRepository outboxRepository,
        IIdempotencyService idempotency,
        ITransactionalUnitOfWork unitOfWork,
        ILogger<ProcessGatewayOrderHandler> logger)
    {
        _requestRepository = requestRepository;
        _outboxRepository = outboxRepository;
        _idempotency = idempotency;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    /// <summary>
    /// Returns true if the request was newly accepted.
    /// Returns false if the request was a duplicate (already processed).
    /// </summary>
    public async Task<bool> HandleAsync(
        ProcessGatewayOrderCommand command,
        CancellationToken cancellationToken = default)
    {
        // ── Idempotency guard (Redis SET NX, TTL 24h) ────────────────────────
        var idempotencyKey = $"idempotency:gateway:{command.RequestId}";
        var isNew = await _idempotency.TryRegisterAsync(
            idempotencyKey, TimeSpan.FromHours(24), cancellationToken);

        if (!isNew)
        {
            _logger.LogInformation(
                "Duplicate gateway request {RequestId} skipped (already processed)",
                command.RequestId);
            return false;
        }

        // ── Build domain objects ─────────────────────────────────────────────
        var gatewayRequest = GatewayRequest.Create(
            command.RequestId, command.Source, command.PayloadJson);

        // Routing key kept backward-compatible so Job Engine consumers
        // (bound to mqtt.MqttMessage.MqttMessageReceived) still receive it.
        var outboxEvent = GatewayOutboxEvent.Create(
            aggregateType: "MqttMessage",
            aggregateId: command.RequestId,
            eventType: "MqttMessageReceived",
            payloadJson: command.PayloadJson,
            routingKeyHint: $"mqtt.MqttMessage.MqttMessageReceived");

        // ── Atomic dual-write ────────────────────────────────────────────────
        await using var tx = await _unitOfWork.BeginTransactionAsync(cancellationToken);
        try
        {
            await _requestRepository.AddAsync(gatewayRequest, cancellationToken);
            await _outboxRepository.AddAsync(outboxEvent, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);

            _logger.LogInformation(
                "Gateway request {RequestId} from {Source} persisted — outbox queued for RabbitMQ",
                command.RequestId, command.Source);

            return true;
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(cancellationToken);
            _logger.LogError(ex,
                "Failed to persist gateway request {RequestId} — transaction rolled back",
                command.RequestId);
            throw;
        }
    }
}
