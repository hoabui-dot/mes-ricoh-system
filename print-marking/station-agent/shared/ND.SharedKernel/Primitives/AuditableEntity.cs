namespace ND.SharedKernel.Primitives;

/// <summary>
/// Entity that tracks created and updated timestamps.
/// </summary>
public abstract class AuditableEntity : Entity
{
    public string UpdatedAt { get; protected set; } = DateTime.UtcNow.ToString("o");

    protected AuditableEntity() { }

    protected AuditableEntity(string id) : base(id) { }

    public void Touch()
    {
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }
}
