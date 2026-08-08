using Microsoft.Extensions.Configuration;

namespace ND.KioskUi.Infrastructure.Messaging;

public sealed record PrinterManagementResponse(int StatusCode, string ContentType, string Body, bool IsBase64 = false, string? FileName = null);

/// <summary>
/// HTTP client for the remotely deployed Printer Adapter. Management requests
/// must not rely on Kafka request/reply routing between separate servers.
/// </summary>
public sealed class PrinterManagementKafkaClient
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;

    public PrinterManagementKafkaClient(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _baseUrl = (Environment.GetEnvironmentVariable("PRINTER_ADAPTER_URL")
            ?? configuration["PRINTER_ADAPTER_URL"]
            ?? "http://printer-adapter:5003").TrimEnd('/');
    }

    public async Task<PrinterManagementResponse> RequestAsync(
        string method, string path, string? query, string body, string requestedBy, CancellationToken ct)
    {
        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        var querySuffix = string.IsNullOrWhiteSpace(query)
            ? string.Empty
            : query.StartsWith('?') ? query : $"?{query}";
        using var request = new HttpRequestMessage(new HttpMethod(method), $"{_baseUrl}{normalizedPath}{querySuffix}");
        if (!string.IsNullOrWhiteSpace(body) && method is "POST" or "PUT" or "PATCH")
            request.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");

        using var response = await _httpClient.SendAsync(request, ct);
        return new PrinterManagementResponse(
            (int)response.StatusCode,
            response.Content.Headers.ContentType?.ToString() ?? "application/json",
            await response.Content.ReadAsStringAsync(ct));
    }
}
