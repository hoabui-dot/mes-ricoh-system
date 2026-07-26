using System.Net.Sockets;
using System.Text.Json.Serialization;

namespace ND.DeviceSimulator.Infrastructure.State;

public sealed class SimulatedPrinter
{
    public required string PrinterCode { get; set; }
    public required string Name { get; set; }
    public required int Port { get; set; }
    public string IpAddress { get; set; } = "127.0.0.1";
    public string Status { get; set; } = "IDLE"; // IDLE, BUSY
    public bool Online { get; set; } = true;
    public int MediaLevel { get; set; } = 100;
    public int RibbonLevel { get; set; } = 100;
    public string? LastZplPreview { get; set; }
    public string? LastResult { get; set; }
    public string? LastJobAt { get; set; }
    public int JobCount { get; set; }
    public string SimulatorMode { get; set; } = "Success";

    [JsonIgnore]
    public TcpListener? Listener { get; set; }

    [JsonIgnore]
    public bool ForceDisconnected { get; set; } = false;

    [JsonIgnore]
    public string? ActiveJobId { get; set; }
}
