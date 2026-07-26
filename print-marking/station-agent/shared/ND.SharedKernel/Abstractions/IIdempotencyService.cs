namespace ND.SharedKernel.Abstractions;

/// <summary>
/// Checks and registers idempotency keys in Redis to prevent duplicate processing.
/// </summary>
public interface IIdempotencyService
{
    /// <summary>
    /// Returns true if the key is new (first time seen). Registers it atomically.
    /// Returns false if the key was already processed.
    /// </summary>
    Task<bool> TryRegisterAsync(string key, TimeSpan ttl, CancellationToken cancellationToken = default);

    Task RemoveAsync(string key, CancellationToken cancellationToken = default);
}
