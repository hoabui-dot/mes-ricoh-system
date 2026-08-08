using ND.SharedKernel.Time;

namespace ND.Testing.Fixtures;

/// <summary>A deterministic, explicitly advanced clock for domain and integration tests.</summary>
public sealed class TestClock : ISystemClock
{
    public TestClock(DateTime utcNow)
    {
        UtcNow = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
    }

    public DateTime UtcNow { get; private set; }

    public void Advance(TimeSpan duration) => UtcNow = UtcNow.Add(duration);

    public void Set(DateTime utcNow) => UtcNow = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
}
