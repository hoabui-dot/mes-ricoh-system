using System;
using System.IO;

namespace ND.Infrastructure.SQLite;

/// <summary>
/// Helper to ensure SQLite database folders exist before database initialization.
/// </summary>
public static class SqlitePathHelper
{
    public static string ResolveWritableDbPath(string configuredPath)
    {
        var path = ExtractPath(configuredPath);
        if (string.IsNullOrWhiteSpace(path) || path == ":memory:") return path;

        if (CanWriteToDirectory(path)) return path;

        var fallbackDirectory = Path.Combine(Path.GetTempPath(), "nd-station-agent");
        Directory.CreateDirectory(fallbackDirectory);
        var fileName = Path.GetFileName(path);
        return Path.Combine(fallbackDirectory, string.IsNullOrWhiteSpace(fileName) ? "station.db" : fileName);
    }

    public static string VerifyAndCreateDirectory(string connectionStringOrPath)
    {
        if (string.IsNullOrWhiteSpace(connectionStringOrPath))
            return connectionStringOrPath;

        var path = connectionStringOrPath;
        if (connectionStringOrPath.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase))
        {
            path = connectionStringOrPath.Substring("Data Source=".Length).Trim();
        }
        else if (connectionStringOrPath.StartsWith("DataSource=", StringComparison.OrdinalIgnoreCase))
        {
            path = connectionStringOrPath.Substring("DataSource=".Length).Trim();
        }

        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }
        catch
        {
            // Suppress directory creation issues, EF Core will raise standard exceptions if it still cannot open/write.
        }

        return connectionStringOrPath;
    }

    private static string ExtractPath(string connectionStringOrPath)
    {
        if (connectionStringOrPath.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase))
            return connectionStringOrPath["Data Source=".Length..].Trim();
        if (connectionStringOrPath.StartsWith("DataSource=", StringComparison.OrdinalIgnoreCase))
            return connectionStringOrPath["DataSource=".Length..].Trim();
        return connectionStringOrPath;
    }

    private static bool CanWriteToDirectory(string databasePath)
    {
        try
        {
            var fullPath = Path.GetFullPath(databasePath);
            var directory = Path.GetDirectoryName(fullPath);
            if (string.IsNullOrWhiteSpace(directory)) return false;
            Directory.CreateDirectory(directory);
            var probe = Path.Combine(directory, $".write_probe_{Guid.NewGuid():N}");
            using (File.Create(probe, 1, FileOptions.DeleteOnClose)) { }
            if (File.Exists(probe)) File.Delete(probe);
            return true;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException or System.Security.SecurityException)
        {
            return false;
        }
    }
}
