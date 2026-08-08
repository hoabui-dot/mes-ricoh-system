using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace ND.Testing.Fixtures;

/// <summary>
/// Creates an in-memory SQLite DbContext for integration tests.
/// Ensures the schema is created and disposed after each test.
/// </summary>
public sealed class SqliteFixture<TContext> : IDisposable, IAsyncDisposable
    where TContext : DbContext
{
    private readonly SqliteConnection _connection;

    public TContext Context { get; }

    public SqliteFixture(Func<DbContextOptions<TContext>, TContext> factory)
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<TContext>()
            .UseSqlite(_connection)
            .Options;

        Context = factory(options);
        Context.Database.EnsureCreated();
    }

    public void Dispose()
    {
        Context.Database.EnsureDeleted();
        Context.Dispose();
        _connection.Dispose();
    }

    public async ValueTask DisposeAsync()
    {
        await Context.Database.EnsureDeletedAsync();
        await Context.DisposeAsync();
        await _connection.DisposeAsync();
    }
}
