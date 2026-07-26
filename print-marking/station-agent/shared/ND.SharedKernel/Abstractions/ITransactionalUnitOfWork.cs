namespace ND.SharedKernel.Abstractions;

/// <summary>
/// Extends IUnitOfWork with explicit database transaction control.
/// Allows callers to atomically commit or rollback multiple repository operations.
/// </summary>
public interface ITransactionalUnitOfWork : IUnitOfWork
{
    /// <summary>
    /// Begin an explicit database transaction.
    /// The returned object must be committed or rolled back by the caller.
    /// </summary>
    Task<IDbTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Represents an active database transaction. Dispose to roll back if not committed.
/// </summary>
public interface IDbTransaction : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken = default);
    Task RollbackAsync(CancellationToken cancellationToken = default);
}
