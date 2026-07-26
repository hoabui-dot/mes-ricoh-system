namespace ND.SharedKernel.Time;

public interface ISystemClock
{
    DateTime UtcNow { get; }
    string UtcNowIso => UtcNow.ToString("o");
}

public sealed class SystemClock : ISystemClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
