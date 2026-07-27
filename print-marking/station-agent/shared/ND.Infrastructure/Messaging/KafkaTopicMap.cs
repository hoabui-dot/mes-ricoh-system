namespace ND.Infrastructure.Messaging;

public static class KafkaTopicMap
{
    public const string PrinterCommands = "station.commands.printer";
    public const string PrinterEvents = "station.events.printer";
    public const string JobEvents = "station.events.jobs";
    public const string DeviceEvents = "station.events.devices";
    public const string ProductionEvents = "station.events.production";
    public const string IntegrationEvents = "station.events.integration";
    public const string DeadLetter = "station.dlq";

    public static string ForRoutingKey(string routingKey)
    {
        if (string.Equals(routingKey, DeadLetter, StringComparison.OrdinalIgnoreCase)) return DeadLetter;
        if (routingKey.StartsWith("command.printer.", StringComparison.OrdinalIgnoreCase)) return PrinterCommands;
        if (routingKey.StartsWith("printer.", StringComparison.OrdinalIgnoreCase)) return PrinterEvents;
        if (routingKey.StartsWith("job.", StringComparison.OrdinalIgnoreCase)) return JobEvents;
        if (routingKey.StartsWith("device.", StringComparison.OrdinalIgnoreCase)) return DeviceEvents;
        if (routingKey.StartsWith("production.", StringComparison.OrdinalIgnoreCase)) return ProductionEvents;
        if (routingKey.StartsWith("mqtt.", StringComparison.OrdinalIgnoreCase) || routingKey.StartsWith("command.", StringComparison.OrdinalIgnoreCase)) return IntegrationEvents;
        return IntegrationEvents;
    }

    public static string ForSubscription(string pattern)
    {
        if (string.Equals(pattern, DeadLetter, StringComparison.OrdinalIgnoreCase)) return DeadLetter;
        if (pattern.StartsWith("command.printer.", StringComparison.OrdinalIgnoreCase)) return PrinterCommands;
        if (pattern.StartsWith("printer.", StringComparison.OrdinalIgnoreCase)) return PrinterEvents;
        if (pattern.StartsWith("job.", StringComparison.OrdinalIgnoreCase)) return JobEvents;
        if (pattern.StartsWith("device.", StringComparison.OrdinalIgnoreCase)) return DeviceEvents;
        if (pattern.StartsWith("production.", StringComparison.OrdinalIgnoreCase)) return ProductionEvents;
        if (pattern.StartsWith("mqtt.", StringComparison.OrdinalIgnoreCase) || pattern.StartsWith("command.", StringComparison.OrdinalIgnoreCase)) return IntegrationEvents;
        return IntegrationEvents;
    }
}
