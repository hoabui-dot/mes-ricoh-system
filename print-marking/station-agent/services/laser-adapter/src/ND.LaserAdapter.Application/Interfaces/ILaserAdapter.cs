namespace ND.LaserAdapter.Application.Interfaces;

/// <summary>
/// Contract for sending a laser mark command to a physical or virtual laser device.
/// </summary>
public interface ILaserAdapter
{
    /// <summary>
    /// Sends a MARK command to the laser device at the given endpoint.
    /// </summary>
    /// <param name="endpoint">Host:port string, e.g. "localhost:8901"</param>
    /// <param name="template">Laser template name</param>
    /// <param name="markContent">Content/data to mark</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>True if the mark succeeded; false if the device returned a failure response.</returns>
    Task<(bool Success, int DurationMs, string? Error)> MarkAsync(
        string endpoint,
        string template,
        string markContent,
        CancellationToken cancellationToken = default);
}
