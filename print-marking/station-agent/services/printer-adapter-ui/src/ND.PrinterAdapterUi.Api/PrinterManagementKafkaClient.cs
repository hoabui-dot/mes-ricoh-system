public sealed record PrinterManagementResponse(int StatusCode, string ContentType, string Body);

/// <summary>
/// Compatibility client for the existing monitoring API. The Printer Adapter
/// is deployed on a separate Mac host, so management reads use its published
/// HTTP API instead of relying on Kafka request/reply availability.
/// </summary>
public sealed class PrinterManagementKafkaClient
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public PrinterManagementKafkaClient(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<PrinterManagementResponse> RequestAsync(string method, string path, string? query, CancellationToken ct)
    {
        var baseUrl = _configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
        var target = new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), path.TrimStart('/') + (query ?? string.Empty));
        using var request = new HttpRequestMessage(new HttpMethod(method), target);
        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        return new PrinterManagementResponse(
            (int)response.StatusCode,
            response.Content.Headers.ContentType?.MediaType ?? "application/json",
            await response.Content.ReadAsStringAsync(ct));
    }
}
