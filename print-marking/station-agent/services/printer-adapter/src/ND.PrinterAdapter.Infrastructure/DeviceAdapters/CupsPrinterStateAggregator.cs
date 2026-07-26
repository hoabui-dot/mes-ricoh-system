using System.Net;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>
/// Aggregates printer state from multiple CUPS sources using the IPP (Internet Printing Protocol)
/// over HTTP. Works from inside a Docker container on macOS via host.docker.internal:631.
///
/// Primary source: CUPS IPP Get-Printer-Attributes (RFC 8011)
///   POST http://host.docker.internal:631/printers/{queue}
///   Content-Type: application/ipp
///   → Returns structured binary: printer-state, printer-state-reasons, queued-job-count
///
/// Fallback: TCP ping to host.docker.internal:631
///   → Returns Offline if unreachable.
///
/// State mapping:
///   IPP printer-state 3 (Idle)       + no bad reasons  → Online
///   IPP printer-state 3 (Idle)       + media-low/warn  → Warning
///   IPP printer-state 4 (Processing) + none            → Busy
///   IPP printer-state 4 (Processing) + job-printing    → Printing
///   IPP printer-state 5 (Stopped)    + offline-report  → Offline
///   IPP printer-state 5 (Stopped)    + any             → Error
///   Any                              + offline-report  → Offline
///   Any                              + connecting      → Connecting
///   queued-job-count > 0 + Stopped                    → Waiting
///   IPP unreachable + TCP reachable                    → Unknown
///   IPP unreachable + TCP unreachable                  → Offline
/// </summary>
public sealed class CupsPrinterStateAggregator : ICupsPrinterStateAggregator
{
    private readonly ILogger<CupsPrinterStateAggregator> _logger;
    private readonly HttpClient _httpClient;

    // CUPS endpoint resolution (priority order):
    //   1. CUPS_SERVER env var  (format: "host:port" e.g. "127.0.0.1:8631" — set by docker-compose)
    //   2. CUPS_HEALTH_HOST + CUPS_HEALTH_PORT env vars (explicit override)
    //   3. Default: host.docker.internal:631
    private static readonly string CupsHost;
    private static readonly int    CupsPort;

    static CupsPrinterStateAggregator()
    {
        var server = Environment.GetEnvironmentVariable("CUPS_SERVER");
        if (!string.IsNullOrWhiteSpace(server))
        {
            // Format: "host:port" e.g. "127.0.0.1:8631"
            var idx = server.LastIndexOf(':');
            if (idx > 0 && int.TryParse(server[(idx + 1)..], out var p))
            {
                CupsHost = server[..idx];
                CupsPort = p;
            }
            else
            {
                CupsHost = server;
                CupsPort = 631;
            }
        }
        else
        {
            CupsHost = Environment.GetEnvironmentVariable("CUPS_HEALTH_HOST") ?? "host.docker.internal";
            CupsPort = int.TryParse(Environment.GetEnvironmentVariable("CUPS_HEALTH_PORT") ?? "631", out var p2) ? p2 : 631;
        }
    }

    // IPP value-tags
    private const byte TagCharset         = 0x47;
    private const byte TagNaturalLanguage = 0x48;
    private const byte TagUri             = 0x45;
    private const byte TagKeyword         = 0x44;
    private const byte TagOperationGroup  = 0x01;
    private const byte TagEndOfAttributes = 0x03;

    public CupsPrinterStateAggregator(ILogger<CupsPrinterStateAggregator> logger, HttpClient httpClient)
    {
        _logger     = logger;
        _httpClient = httpClient;
    }

    public async Task<NormalizedPrinterState> GetStateAsync(string queueName, CancellationToken ct = default)
    {
        try
        {
            var printerUri = $"ipp://{CupsHost}/printers/{queueName}";
            var httpUrl    = $"http://{CupsHost}:{CupsPort}/printers/{queueName}";

            _logger.LogDebug("[CUPS-IPP] {Queue}: querying {Url}", queueName, httpUrl);

            var ippRequest = BuildGetPrinterAttributesRequest(printerUri);

            using var content  = new ByteArrayContent(ippRequest);
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/ipp");

            using var response = await _httpClient.PostAsync(httpUrl, content, ct);
            var responseBytes  = await response.Content.ReadAsByteArrayAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[CUPS-IPP] {Queue}: HTTP {Status} — falling back to TCP ping {Host}:{Port}",
                    queueName, (int)response.StatusCode, CupsHost, CupsPort);
                return await TcpFallbackAsync(ct);
            }

            var (printerState, reasons, queueLength, deviceId, info, model) = ParseIppResponse(responseBytes);
            var serialNumber = ParseSerialNumber(deviceId);

            _logger.LogDebug("[CUPS-IPP] {Queue}: state={S} reasons=[{R}] jobs={J} sn={SN} info={I} model={M}",
                queueName, printerState, string.Join(",", reasons), queueLength, serialNumber, info, model);

            return Normalize(printerState, reasons, queueLength, serialNumber);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[CUPS-IPP] {Queue}: IPP request failed — falling back to TCP", queueName);
            return await TcpFallbackAsync(ct);
        }
    }

    private static string? ParseSerialNumber(string? deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId)) return null;
        var parts = deviceId.Split(';');
        foreach (var part in parts)
        {
            var pair = part.Split(':');
            if (pair.Length == 2)
            {
                var key = pair[0].Trim().ToUpperInvariant();
                var val = pair[1].Trim();
                if (key is "SN" or "SER" or "SERIAL" or "SERIALNUMBER")
                {
                    return val;
                }
            }
        }
        return null;
    }

    // ── IPP Request Builder ───────────────────────────────────────────────────

    /// <summary>
    /// Builds a minimal IPP 1.1 Get-Printer-Attributes request (RFC 8011 §4.2.5).
    /// Requests: printer-state, printer-state-reasons, queued-job-count.
    /// </summary>
    private static byte[] BuildGetPrinterAttributesRequest(string printerUri)
    {
        using var ms = new MemoryStream();
        using var w  = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true);

        // IPP header
        w.Write((byte)0x01); w.Write((byte)0x01);   // Version 1.1
        w.Write((byte)0x00); w.Write((byte)0x0B);   // Operation-id: Get-Printer-Attributes
        w.Write((byte)0x00); w.Write((byte)0x00); w.Write((byte)0x00); w.Write((byte)0x01); // Request-id: 1

        // begin-attribute-group: operation-attributes
        w.Write(TagOperationGroup);

        WriteAttribute(w, TagCharset,         "attributes-charset",          "utf-8");
        WriteAttribute(w, TagNaturalLanguage, "attributes-natural-language", "en-us");
        WriteAttribute(w, TagUri,             "printer-uri",                 printerUri);

        // requested-attributes: first value has name, subsequent have empty name (IPP §3.1.6)
        WriteAttribute(w, TagKeyword, "requested-attributes", "printer-state");
        WriteAdditionalValue(w, TagKeyword, "printer-state-reasons");
        WriteAdditionalValue(w, TagKeyword, "queued-job-count");
        WriteAdditionalValue(w, TagKeyword, "printer-device-id");
        WriteAdditionalValue(w, TagKeyword, "printer-info");
        WriteAdditionalValue(w, TagKeyword, "printer-make-and-model");

        // end-of-attributes
        w.Write(TagEndOfAttributes);

        return ms.ToArray();
    }

    private static void WriteAttribute(BinaryWriter w, byte tag, string name, string value)
    {
        var n = Encoding.UTF8.GetBytes(name);
        var v = Encoding.UTF8.GetBytes(value);
        w.Write(tag);
        WriteBigEndianShort(w, (short)n.Length);
        w.Write(n);
        WriteBigEndianShort(w, (short)v.Length);
        w.Write(v);
    }

    private static void WriteAdditionalValue(BinaryWriter w, byte tag, string value)
    {
        var v = Encoding.UTF8.GetBytes(value);
        w.Write(tag);
        WriteBigEndianShort(w, 0);   // empty name = additional value for same attribute
        WriteBigEndianShort(w, (short)v.Length);
        w.Write(v);
    }

    private static void WriteBigEndianShort(BinaryWriter w, short value)
    {
        w.Write((byte)((value >> 8) & 0xFF));
        w.Write((byte)(value & 0xFF));
    }

    // ── IPP Response Parser ───────────────────────────────────────────────────

    /// <summary>
    /// Parses an IPP binary response to extract printer-state, printer-state-reasons, queued-job-count.
    /// </summary>
    private (int printerState, List<string> reasons, int queueLength, string? deviceId, string? info, string? model) ParseIppResponse(byte[] data)
    {
        int printerState = 0;
        var reasons      = new List<string>();
        int queueLength  = 0;
        string? deviceId = null;
        string? info     = null;
        string? model    = null;

        if (data.Length < 8) return (printerState, reasons, queueLength, deviceId, info, model);

        // Skip fixed header: version(2) + status-code(2) + request-id(4) = 8 bytes
        int i = 8;
        string currentAttrName = "";

        while (i < data.Length)
        {
            byte tag = data[i++];

            // Delimiter tags (< 0x10): attribute group boundaries
            if (tag <= 0x0F)
            {
                if (tag == TagEndOfAttributes) break;
                currentAttrName = "";
                continue;
            }

            // Read name-length (big-endian 2 bytes)
            if (i + 2 > data.Length) break;
            int nameLen = (data[i] << 8) | data[i + 1]; i += 2;

            if (nameLen > 0)
            {
                if (i + nameLen > data.Length) break;
                currentAttrName = Encoding.UTF8.GetString(data, i, nameLen);
                i += nameLen;
            }
            // nameLen == 0 → additional value for currentAttrName (IPP set notation)

            // Read value-length (big-endian 2 bytes)
            if (i + 2 > data.Length) break;
            int valueLen = (data[i] << 8) | data[i + 1]; i += 2;
            if (i + valueLen > data.Length) break;

            switch (currentAttrName)
            {
                case "printer-state" when valueLen == 4:
                    printerState = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
                    break;

                case "printer-state-reasons" when valueLen > 0:
                    var reason = Encoding.UTF8.GetString(data, i, valueLen);
                    if (!string.IsNullOrWhiteSpace(reason))
                        reasons.Add(reason);
                    break;

                case "queued-job-count" when valueLen == 4:
                    queueLength = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
                    break;

                case "printer-device-id" when valueLen > 0:
                    deviceId = Encoding.UTF8.GetString(data, i, valueLen);
                    break;

                case "printer-info" when valueLen > 0:
                    info = Encoding.UTF8.GetString(data, i, valueLen);
                    break;

                case "printer-make-and-model" when valueLen > 0:
                    model = Encoding.UTF8.GetString(data, i, valueLen);
                    break;
            }

            i += valueLen;
        }

        return (printerState, reasons, queueLength, deviceId, info, model);
    }

    /// <summary>
    /// Maps raw CUPS IPP state values to the normalized <see cref="NormalizedPrinterState"/>.
    /// </summary>
    private static NormalizedPrinterState Normalize(int printerState, List<string> reasons, int queueLength, string? serialNumber)
    {
        var reasonSet  = new HashSet<string>(reasons, StringComparer.OrdinalIgnoreCase);
        var firstReason = reasons.Count > 0 ? reasons[0] : null;

        // 1. Connection/Connectivity first
        if (reasonSet.Contains("offline-report") || reasonSet.Contains("disconnected"))
            return new NormalizedPrinterState("Offline", "offline-report", queueLength, null, "ipp", serialNumber);

        if (reasonSet.Contains("connecting-to-device"))
            return new NormalizedPrinterState("Connecting", "connecting-to-device", queueLength, null, "ipp", serialNumber);

        // 2. Hardware Fault overrides (highest state priority)
        if (reasonSet.Contains("cover-open"))
            return new NormalizedPrinterState("Head Open", "cover-open", queueLength, null, "ipp", serialNumber);

        if (reasonSet.Contains("media-empty") || reasonSet.Contains("media-jam"))
            return new NormalizedPrinterState("Paper Out", "media-empty", queueLength, null, "ipp", serialNumber);

        if (reasonSet.Contains("toner-empty") || reasonSet.Contains("marker-supply-empty"))
            return new NormalizedPrinterState("Ribbon Out", "toner-empty", queueLength, null, "ipp", serialNumber);

        if (reasonSet.Contains("spool-area-full"))
            return new NormalizedPrinterState("Buffer Full", "spool-area-full", queueLength, null, "ipp", serialNumber);

        if (reasonSet.Contains("device-overtemperature") || reasonSet.Contains("thermal-warning"))
            return new NormalizedPrinterState("Thermal Warning", "device-overtemperature", queueLength, null, "ipp", serialNumber);

        // 3. Runtime States based on printerState
        // State 3 = Idle
        if (printerState == 3)
        {
            if (reasonSet.Contains("media-low") || reasonSet.Contains("toner-low") || reasonSet.Contains("marker-supply-low-warning"))
                return new NormalizedPrinterState("Warning", firstReason, queueLength, null, "ipp", serialNumber);

            if (queueLength > 0)
                return new NormalizedPrinterState("Waiting", firstReason, queueLength, null, "ipp", serialNumber);

            return new NormalizedPrinterState("Online", firstReason, queueLength, null, "ipp", serialNumber);
        }

        // State 4 = Processing
        if (printerState == 4)
        {
            if (reasonSet.Contains("job-printing"))
                return new NormalizedPrinterState("Printing", firstReason, queueLength, null, "ipp", serialNumber);

            return new NormalizedPrinterState("Busy", firstReason, queueLength, null, "ipp", serialNumber);
        }

        // State 5 = Stopped
        if (printerState == 5)
        {
            if (queueLength > 0)
                return new NormalizedPrinterState("Waiting", firstReason, queueLength, null, "ipp", serialNumber);

            return new NormalizedPrinterState("Error", firstReason ?? "stopped", queueLength, null, "ipp", serialNumber);
        }

        // Unknown state
        return new NormalizedPrinterState("Unknown", firstReason, queueLength, null, "ipp", serialNumber);
    }

    // ── TCP Fallback ──────────────────────────────────────────────────────────

    /// <summary>
    /// Last-resort TCP reachability check against the CUPS endpoint.
    /// If the port is reachable → CUPS tunnel is alive → treat as Online (optimistic).
    /// CUPS being up with a USB-connected printer almost always means the printer is ready.
    /// If the port is unreachable → CUPS is down or tunnel is broken → Offline.
    /// </summary>
    private async Task<NormalizedPrinterState> TcpFallbackAsync(CancellationToken ct)
    {
        try
        {
            using var tcp   = new TcpClient();
            var connectTask = tcp.ConnectAsync(CupsHost, CupsPort, ct).AsTask();
            var completed   = await Task.WhenAny(connectTask, Task.Delay(1000, ct));
            var reachable   = completed == connectTask && tcp.Connected;

            if (reachable)
            {
                // CUPS port is open → tunnel/server is alive.
                // IPP parsing failed for this cycle but CUPS is running, so treat as Online.
                // The next 3s heartbeat will attempt IPP again and may get a more precise state.
                _logger.LogInformation("[CUPS-IPP] TCP fallback {Host}:{Port} reachable → Online (IPP parse failed this cycle)",
                    CupsHost, CupsPort);
                return NormalizedPrinterState.Online();
            }

            _logger.LogWarning("[CUPS-IPP] TCP fallback {Host}:{Port} unreachable → Offline (CUPS tunnel down or printer off)",
                CupsHost, CupsPort);
            return NormalizedPrinterState.FallbackOffline();
        }
        catch
        {
            return NormalizedPrinterState.FallbackOffline();
        }
    }
}
