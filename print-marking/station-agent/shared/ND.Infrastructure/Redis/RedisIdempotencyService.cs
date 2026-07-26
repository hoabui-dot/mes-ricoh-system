using ND.SharedKernel.Abstractions;
using StackExchange.Redis;

namespace ND.Infrastructure.Redis;

/// <summary>
/// Redis-backed idempotency service.
/// Uses SET NX (set if not exists) for atomic check-and-register.
/// </summary>
public sealed class RedisIdempotencyService : IIdempotencyService
{
    private readonly IDatabase _database;

    public RedisIdempotencyService(IConnectionMultiplexer redis)
    {
        _database = redis.GetDatabase();
    }

    public async Task<bool> TryRegisterAsync(string key, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        // SET key "1" NX EX ttl — returns true only if key did not exist
        return await _database.StringSetAsync(key, "1", ttl, When.NotExists);
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        await _database.KeyDeleteAsync(key);
    }
}
