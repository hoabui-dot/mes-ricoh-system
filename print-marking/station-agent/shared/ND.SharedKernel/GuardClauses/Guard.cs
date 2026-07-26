using System.Runtime.CompilerServices;

namespace ND.SharedKernel.GuardClauses;

public static class Guard
{
    public static string NotNullOrWhiteSpace(
        string? value,
        [CallerArgumentExpression(nameof(value))] string paramName = "")
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException($"'{paramName}' must not be null or whitespace.", paramName);
        return value;
    }

    public static T NotNull<T>(
        T? value,
        [CallerArgumentExpression(nameof(value))] string paramName = "")
        where T : class
    {
        return value ?? throw new ArgumentNullException(paramName);
    }

    public static int Positive(
        int value,
        [CallerArgumentExpression(nameof(value))] string paramName = "")
    {
        if (value <= 0)
            throw new ArgumentOutOfRangeException(paramName, $"'{paramName}' must be positive.");
        return value;
    }
}
