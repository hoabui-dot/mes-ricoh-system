using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>
/// Sends raw ZPL to a Zebra printer connected via USB on macOS through the native CUPS subsystem.
/// Uses <c>lpr -P {queue} -o raw</c> for printing — never rasterizes, always sends raw ZPL.
///
/// Health checking is delegated to <see cref="ICupsPrinterStateAggregator"/> which uses the
/// CUPS IPP API (RFC 8011) over HTTP to determine the real hardware state.
/// This replaces the previous approach of pinging localhost:631 which only verified the CUPS
/// daemon was running, NOT the actual hardware.
///
/// Retry policy: 3 attempts with 200ms between each before returning Offline.
/// </summary>
public sealed class CupsPrinterDriver : IPrinterDriver
{
    private readonly string _queueName;
    private readonly ICupsPrinterStateAggregator _aggregator;
    private readonly ILogger<CupsPrinterDriver> _logger;

    private const int MaxRetries   = 3;
    private const int RetryDelayMs = 200;

    public CupsPrinterDriver(
        string queueName,
        ICupsPrinterStateAggregator aggregator,
        ILogger<CupsPrinterDriver> logger)
    {
        _queueName  = queueName;
        _aggregator = aggregator;
        _logger     = logger;
    }

    // ── Print ─────────────────────────────────────────────────────────────────

    public async Task<PrintResult> PrintAsync(string content, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        _logger.LogInformation("[CUPS] Print Request Received → queue={Queue} ({Bytes} bytes)", _queueName, content.Length);

        // Validate queue exists before attempting
        var queueExists = await QueueExistsAsync(ct);
        if (!queueExists)
        {
            return PrintResult.Fail(
                "QUEUE_MISSING",
                $"CUPS queue '{_queueName}' not found. Run: lpstat -p",
                isRecoverable: false, isRetryable: false, durationMs: sw.ElapsedMilliseconds);
        }

        // Validate ZPL minimally
        if (string.IsNullOrWhiteSpace(content) || !content.Contains("^XA"))
        {
            return PrintResult.Fail(
                "INVALID_ZPL",
                "ZPL content is empty or missing ^XA header",
                isRecoverable: false, isRetryable: false, durationMs: sw.ElapsedMilliseconds);
        }

        try
        {
            // Pipe ZPL directly to lpr stdin — no temp files
            var psi = new ProcessStartInfo
            {
                FileName               = "lpr",
                Arguments              = $"-P {_queueName} -o raw",
                RedirectStandardInput  = true,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true
            };

            _logger.LogInformation("[CUPS] Printer Queue Selected → {Queue}", _queueName);
            _logger.LogInformation("[CUPS] Sending ZPL to CUPS via lpr...");

            using var proc = Process.Start(psi)
                ?? throw new InvalidOperationException("Failed to start lpr process");

            // Write ZPL to stdin (in-memory pipe, no temp file)
            await using (var writer = new StreamWriter(proc.StandardInput.BaseStream, Encoding.UTF8, leaveOpen: false))
            {
                await writer.WriteAsync(content);
            }

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(15));

            await proc.WaitForExitAsync(cts.Token);
            sw.Stop();

            var stderr = await proc.StandardError.ReadToEndAsync(ct);

            if (proc.ExitCode != 0)
            {
                var (errorCode, message, recoverable, retryable) = ClassifyLprError(stderr, proc.ExitCode);
                _logger.LogError("[CUPS] lpr failed (exit={Code}): {Stderr}", proc.ExitCode, stderr);
                return PrintResult.Fail(errorCode, message, recoverable, retryable, sw.ElapsedMilliseconds);
            }

            _logger.LogInformation("[CUPS] CUPS Accepted → lpr exit=0, duration={Ms}ms", sw.ElapsedMilliseconds);
            _logger.LogInformation("[CUPS] Completed → queue={Queue}", _queueName);
            return PrintResult.Ok(sw.ElapsedMilliseconds);
        }
        catch (OperationCanceledException)
        {
            return PrintResult.Fail("CUPS_TIMEOUT", "CUPS print timed out after 15 seconds",
                isRecoverable: true, isRetryable: true, durationMs: sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[CUPS] Unexpected error sending to queue {Queue}", _queueName);
            return PrintResult.Fail("UNEXPECTED", ex.Message,
                isRecoverable: false, isRetryable: false, durationMs: sw.ElapsedMilliseconds);
        }
    }

    // ── Status ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the normalized printer status by querying the CUPS IPP API via
    /// <see cref="ICupsPrinterStateAggregator"/>. Retries 3 times with 200ms gaps
    /// before falling back to Offline.
    /// </summary>
    public async Task<PrinterDriverStatus> GetStatusAsync(CancellationToken ct = default)
    {
        for (int attempt = 0; attempt < MaxRetries; attempt++)
        {
            try
            {
                var state = await _aggregator.GetStateAsync(_queueName, ct);
                var status = MapToDriverStatus(state.State);

                // If the printer reports Offline due to communication failure (unreachable),
                // retry up to MaxRetries before declaring it Offline.
                if (status == PrinterDriverStatus.Offline && state.StateReason == "unreachable")
                {
                    if (attempt < MaxRetries - 1)
                    {
                        _logger.LogDebug("[CUPS] {Queue} GetStatusAsync: unreachable, retrying ({A}/{Max}) in {D}ms",
                            _queueName, attempt + 1, MaxRetries, RetryDelayMs);
                        await Task.Delay(RetryDelayMs, ct);
                        continue;
                    }
                }

                _logger.LogDebug("[CUPS] {Queue} GetStatusAsync → {State} (reason={Reason}, jobs={Jobs})",
                    _queueName, status, state.StateReason ?? "none", state.QueueLength);
                return status;
            }
            catch (Exception ex) when (attempt < MaxRetries - 1)
            {
                _logger.LogDebug(ex, "[CUPS] {Queue} GetStatusAsync attempt {A}/{Max} failed — retrying in {D}ms",
                    _queueName, attempt + 1, MaxRetries, RetryDelayMs);
                await Task.Delay(RetryDelayMs, ct);
            }
        }

        _logger.LogWarning("[CUPS] {Queue} GetStatusAsync: all {Max} attempts failed → Offline", _queueName, MaxRetries);
        return PrinterDriverStatus.Offline;
    }

    // ── Discovery ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<DiscoveredPrinter>> DiscoverAsync(CancellationToken ct = default)
    {
        // Discovery via lpstat is only available when running on the host (not in Docker).
        // When running in Docker, return empty — printers are seeded via PrinterDbSeeder.
        var result = new List<DiscoveredPrinter>();
        try
        {
            var output = await RunCommandAsync("lpstat", "-p -d", ct);
            if (string.IsNullOrWhiteSpace(output))
                return result;

            var printerRegex = new Regex(@"^printer\s+(\S+)\s+is\s+(\S+)", RegexOptions.Multiline | RegexOptions.IgnoreCase);
            var defaultRegex = new Regex(@"^system default destination:\s+(\S+)", RegexOptions.Multiline | RegexOptions.IgnoreCase);

            var defaultMatch = defaultRegex.Match(output);
            var defaultQueue = defaultMatch.Success ? defaultMatch.Groups[1].Value : null;

            foreach (Match m in printerRegex.Matches(output))
            {
                var name      = m.Groups[1].Value;
                var statusWord = m.Groups[2].Value.TrimEnd('.');
                result.Add(new DiscoveredPrinter
                {
                    Id         = name,
                    Name       = name.Replace("_", " "),
                    QueueName  = name,
                    Driver     = "cups",
                    Status     = statusWord,
                    IsDefault  = string.Equals(name, defaultQueue, StringComparison.OrdinalIgnoreCase)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[CUPS] Discover failed (expected when running in Docker)");
        }

        return result;
    }

    // ── Health ────────────────────────────────────────────────────────────────

    public async Task<bool> HealthCheckAsync(CancellationToken ct = default)
    {
        var status = await GetStatusAsync(ct);
        return status is PrinterDriverStatus.Online
                      or PrinterDriverStatus.Busy
                      or PrinterDriverStatus.Printing
                      or PrinterDriverStatus.Waiting
                      or PrinterDriverStatus.Warning;
    }

    public async Task<PrinterMaintenanceInfo?> GetMaintenanceInfoAsync(CancellationToken ct = default)
    {
        try
        {
            var state = await _aggregator.GetStateAsync(_queueName, ct);
            var isThermalWarning = state.State == "Thermal Warning";
            return new PrinterMaintenanceInfo(
                SerialNumber: state.SerialNumber ?? "SN-ZEBRA-GK420T",
                LifetimePrintLength: 12500, // simulated default for demo
                LastMaintenanceDate: DateTime.UtcNow.AddDays(-14).ToString("yyyy-MM-dd"),
                RecommendedCleaning: "Lau đầu in sau mỗi cuộn nhãn (Clean print head every ribbon roll)",
                ThermalWarning: isThermalWarning,
                CurrentTemperature: isThermalWarning ? 65.0 : 28.0
            );
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[CUPS] GetMaintenanceInfoAsync failed for {Queue}", _queueName);
            return null;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>Maps normalized state string to PrinterDriverStatus enum.</summary>
    private static PrinterDriverStatus MapToDriverStatus(string state) => state switch
    {
        "Online"          => PrinterDriverStatus.Online,
        "Busy"            => PrinterDriverStatus.Busy,
        "Printing"        => PrinterDriverStatus.Printing,
        "Waiting"         => PrinterDriverStatus.Waiting,
        "Warning"         => PrinterDriverStatus.Warning,
        "Connecting"      => PrinterDriverStatus.Connecting,
        "Offline"         => PrinterDriverStatus.Offline,
        "Error"           => PrinterDriverStatus.Error,
        "Head Open"       => PrinterDriverStatus.HeadOpen,
        "Paper Out"       => PrinterDriverStatus.PaperOut,
        "Ribbon Out"      => PrinterDriverStatus.RibbonOut,
        "Buffer Full"     => PrinterDriverStatus.BufferFull,
        "Thermal Warning" => PrinterDriverStatus.ThermalWarning,
        _                 => PrinterDriverStatus.Unknown
    };

    private async Task<bool> QueueExistsAsync(CancellationToken ct)
    {
        try
        {
            var output = await RunCommandAsync("lpstat", "-p", ct);
            return output.Contains(_queueName, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            // lpstat not available in Docker — assume queue exists and let lpr fail gracefully
            return true;
        }
    }

    private static async Task<string> RunCommandAsync(string command, string args, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName               = command,
            Arguments              = args,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true
        };

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start {command}");
        using var cts  = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(10));
        await proc.WaitForExitAsync(cts.Token);
        return await proc.StandardOutput.ReadToEndAsync(ct);
    }

    private static (string code, string message, bool recoverable, bool retryable) ClassifyLprError(string stderr, int exitCode)
    {
        var lower = stderr.ToLowerInvariant();

        if (lower.Contains("permission denied"))
            return ("PERMISSION_DENIED", $"Permission denied accessing CUPS: {stderr}", false, false);
        if (lower.Contains("no such file") || lower.Contains("unknown printer"))
            return ("INVALID_QUEUE", $"Queue not found: {stderr}", false, false);
        if (lower.Contains("offline") || lower.Contains("not connected"))
            return ("PRINTER_OFFLINE", $"Printer offline: {stderr}", true, true);
        if (lower.Contains("paper") || lower.Contains("media"))
            return ("PAPER_OUT", $"Paper out: {stderr}", true, false);
        if (lower.Contains("ribbon") || lower.Contains("ink"))
            return ("RIBBON_OUT", $"Ribbon/ink out: {stderr}", true, false);
        if (lower.Contains("busy"))
            return ("PRINTER_BUSY", $"Printer busy: {stderr}", true, true);
        if (lower.Contains("timeout"))
            return ("CUPS_TIMEOUT", $"CUPS timeout: {stderr}", true, true);

        return ("LPR_ERROR", $"lpr failed (exit={exitCode}): {stderr}", false, false);
    }
}
