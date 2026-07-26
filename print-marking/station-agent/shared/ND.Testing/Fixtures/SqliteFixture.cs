using Microsoft.EntityFrameworkCore;

namespace ND.Testing.Fixtures;

/// <summary>
/// Creates an in-memory SQLite DbContext for integration tests.
/// Ensures the schema is created and disposed after each test.
/// </summary>
public sealed class SqliteFixture<TContext> : IDisposable
    where TContext : DbContext
{
    public TContext Context { get; }

    public SqliteFixture(Func<DbContextOptions<TContext>, TContext> factory)
    {
        var options = new DbContextOptionsBuilder<TContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        Context = factory(options);
        Context.Database.EnsureCreated();
    }

    public void Dispose()
    {
        Context.Database.EnsureDeleted();
        Context.Dispose();
    }
}
