using System;
using System.IO;

namespace ND.Infrastructure.SQLite;

/// <summary>
/// Helper to ensure SQLite database folders exist before database initialization.
/// </summary>
public static class SqlitePathHelper
{
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
}
