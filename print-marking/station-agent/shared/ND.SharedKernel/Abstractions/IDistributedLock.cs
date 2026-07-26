namespace ND.SharedKernel.Abstractions;

/// <summary>
/// Redis-backed distributed lock for critical sections (e.g. job processing).
/// </summary>
public interface IDistributedLock
{
    /// <summary>
    /// Acquires a lock with the given key for the specified duration.
    /// Returns an IAsyncDisposable that releases the lock when disposed.
    /// Returns null if the lock could not be acquired.
    /// </summary>
    Task<IAsyncDisposable?> TryAcquireAsync(string key, TimeSpan duration, CancellationToken cancellationToken = default);
}
