using StackExchange.Redis;

namespace ND.Infrastructure.Redis;

/// <summary>
/// Manages device heartbeat state in Redis.
/// Keys: printer:status:{id}, laser:status:{id}, plc:status:{id}
/// </summary>
public sealed class RedisHeartbeatCache
{
    private readonly IDatabase _database;

    public RedisHeartbeatCache(IConnectionMultiplexer redis)
    {
        _database = redis.GetDatabase();
    }

    public async Task SetHeartbeatAsync(string key, string status, TimeSpan ttl)
    {
        await _database.StringSetAsync(key, status, ttl);
    }

    public async Task<string?> GetHeartbeatAsync(string key)
    {
        var value = await _database.StringGetAsync(key);
        return value.HasValue ? value.ToString() : null;
    }
}
