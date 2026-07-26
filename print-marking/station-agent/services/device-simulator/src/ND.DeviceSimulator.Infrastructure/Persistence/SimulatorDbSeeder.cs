using Microsoft.EntityFrameworkCore;
using ND.DeviceSimulator.Domain.Entities;

namespace ND.DeviceSimulator.Infrastructure.Persistence;

/// <summary>
/// Seeds default configuration values on first startup.
/// Virtual devices start automatically — no device records needed.
/// </summary>
public static class SimulatorDbSeeder
{
    public static async Task SeedAsync(SimulatorDbContext context)
    {
        var defaultConfigs = new List<ConfigurationValue>
        {
            // MQTT / Factory Gateway
            ConfigurationValue.Create("MQTT_HOST", "localhost", "MQTT broker hostname", isEditable: true),
            ConfigurationValue.Create("MQTT_PORT", "1883", "MQTT broker port", isEditable: true),
            ConfigurationValue.Create("MQTT_USERNAME", "", "MQTT username (leave blank for anonymous)", isEditable: true),
            ConfigurationValue.Create("MQTT_PASSWORD", "", "MQTT password", isEditable: true),
            ConfigurationValue.Create("MQTT_PUBLISH_TOPIC", "factory/events/simulator", "Default publish topic", isEditable: true),
            ConfigurationValue.Create("MQTT_SUBSCRIBE_TOPIC", "factory/commands/#", "Subscribe topic filter", isEditable: true),

            // Station identity for UnifiedEvent payloads
            ConfigurationValue.Create("SITE_CODE", "FACTORY-A", "Site code for UnifiedEvent", isEditable: true),
            ConfigurationValue.Create("AREA_CODE", "LINE-1", "Area code", isEditable: true),
            ConfigurationValue.Create("LINE_CODE", "LINE-1", "Line code", isEditable: true),
            ConfigurationValue.Create("MACHINE_CODE", "SIMULATOR-01", "Machine code", isEditable: true),
            ConfigurationValue.Create("EDGE_ID", "edge-simulator", "Edge device ID", isEditable: true),

            // Virtual device ports
            ConfigurationValue.Create("PRINTER_TCP_PORT", "9100", "Virtual printer TCP port", isEditable: true),
            ConfigurationValue.Create("LASER_TCP_PORT", "8901", "Virtual laser TCP port", isEditable: true),
            ConfigurationValue.Create("PLC_MODBUS_PORT", "5020", "Virtual PLC Modbus TCP port", isEditable: true),

            // Simulation behaviour
            ConfigurationValue.Create("PRINTER_FAILURE_RATE", "5", "Printer failure rate 0-100%", isEditable: true),
            ConfigurationValue.Create("PRINTER_DELAY_MS", "800", "Printer simulated processing delay (ms)", isEditable: true),
            ConfigurationValue.Create("LASER_FAILURE_RATE", "3", "Laser failure rate 0-100%", isEditable: true),
            ConfigurationValue.Create("LASER_DELAY_MS", "2000", "Laser simulated processing delay (ms)", isEditable: true),
            ConfigurationValue.Create("VISION_PASS_RATE", "95", "Vision pass rate 0-100%", isEditable: true),
            ConfigurationValue.Create("VISION_FAILURE_RATE", "0", "Vision hard failure rate 0-100%", isEditable: true),
            ConfigurationValue.Create("VISION_DELAY_MS", "500", "Vision simulated processing delay (ms)", isEditable: true),
            ConfigurationValue.Create("PLC_FAILURE_RATE", "0", "PLC command failure rate 0-100%", isEditable: true),

            // Auto-schedule gateway events
            ConfigurationValue.Create("GATEWAY_AUTO_PUBLISH_ENABLED", "false", "Auto-publish gateway events on interval", isEditable: true),
            ConfigurationValue.Create("GATEWAY_AUTO_PUBLISH_INTERVAL_SEC", "30", "Auto-publish interval (seconds)", isEditable: true),

            // Centralized device configurations
            ConfigurationValue.Create("PRINTER_IP", "192.168.1.150", "Physical Printer IP Address", isEditable: true),
            ConfigurationValue.Create("PRINTER_PORT", "9100", "Physical Printer ZPL Raw Port", isEditable: true),
            ConfigurationValue.Create("LASER_ENDPOINT", "localhost:8901", "Laser marking terminal socket endpoint", isEditable: true),
            ConfigurationValue.Create("LASER_TEMPLATE", "standard_industrial", "Default Laser template code", isEditable: true),
            ConfigurationValue.Create("VISION_ENDPOINT", "http://localhost:5000", "Vision camera service base URL", isEditable: true),
            ConfigurationValue.Create("VISION_DEFECT_CODE", "BAD_OCR", "Vision defect alert mapping code", isEditable: true),
            ConfigurationValue.Create("PLC_PORT", "502", "Modbus TCP PLC Port", isEditable: true),
            ConfigurationValue.Create("PLC_REJECT_REGISTER", "1001", "Rejection coil register offset", isEditable: true)
        };

        var existingKeys = await context.ConfigurationValues.Select(c => c.Key).ToListAsync();
        foreach (var cfg in defaultConfigs)
        {
            if (!existingKeys.Contains(cfg.Key))
            {
                await context.ConfigurationValues.AddAsync(cfg);
            }
        }

        await context.SaveChangesAsync();
    }
}
