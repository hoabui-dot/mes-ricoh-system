namespace ND.SharedKernel.Primitives;

/// <summary>
/// Base entity with ULID-based string identity.
/// All entities across all services inherit from this.
/// </summary>
public abstract class Entity
{
    public string Id { get; protected set; } = Guid.NewGuid().ToString();
    public string CreatedAt { get; protected set; } = DateTime.UtcNow.ToString("o");

    protected Entity() { }

    protected Entity(string id)
    {
        Id = id;
    }
}
