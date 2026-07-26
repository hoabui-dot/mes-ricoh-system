using ND.SharedKernel.Abstractions;
using StackExchange.Redis;

namespace ND.Infrastructure.Redis;

/// <summary>
/// Redis-backed distributed lock using SET NX with expiry.
/// Generates a unique token per lock acquisition to prevent accidental release.
/// </summary>
public sealed class RedisDistributedLock : IDistributedLock
{
    private readonly IDatabase _database;

    public RedisDistributedLock(IConnectionMultiplexer redis)
    {
        _database = redis.GetDatabase();
    }

    public async Task<IAsyncDisposable?> TryAcquireAsync(
        string key,
        TimeSpan duration,
        CancellationToken cancellationToken = default)
    {
        var token = Guid.NewGuid().ToString("N");
        var acquired = await _database.StringSetAsync(key, token, duration, When.NotExists);
        if (!acquired) return null;
        return new LockHandle(_database, key, token);
    }

    private sealed class LockHandle : IAsyncDisposable
    {
        private readonly IDatabase _database;
        private readonly string _key;
        private readonly string _token;

        public LockHandle(IDatabase database, string key, string token)
        {
            _database = database;
            _key = key;
            _token = token;
        }

        public async ValueTask DisposeAsync()
        {
            // Only delete if the token matches (prevents releasing someone else's lock)
            var script = @"
                if redis.call('GET', KEYS[1]) == ARGV[1] then
                    return redis.call('DEL', KEYS[1])
                else
                    return 0
                end";
            await _database.ScriptEvaluateAsync(script, [(RedisKey)_key], [(RedisValue)_token]);
        }
    }
}
