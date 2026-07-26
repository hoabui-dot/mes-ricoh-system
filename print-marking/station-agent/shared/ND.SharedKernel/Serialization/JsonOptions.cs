using System.Text.Json;
using System.Text.Json.Serialization;

namespace ND.SharedKernel.Serialization;

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    public static string Serialize<T>(T value) =>
        JsonSerializer.Serialize(value, Default);

    public static T? Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Default);
}
