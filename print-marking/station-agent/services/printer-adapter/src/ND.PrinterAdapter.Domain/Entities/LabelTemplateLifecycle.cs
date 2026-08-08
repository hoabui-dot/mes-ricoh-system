namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// Canonical lifecycle values with legacy status compatibility during rollout.
/// </summary>
public static class LabelTemplateLifecycle
{
    public const string Draft = "DRAFT";
    public const string Validated = "VALIDATED";
    public const string PendingApproval = "PENDING_APPROVAL";
    public const string Approved = "APPROVED";
    public const string Active = "ACTIVE";
    public const string Retired = "RETIRED";

    public static bool IsProductionResolvable(string? status) =>
        string.Equals(status, Active, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(status, "published", StringComparison.OrdinalIgnoreCase);

    public static bool IsRetired(string? status) =>
        string.Equals(status, Retired, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(status, "archived", StringComparison.OrdinalIgnoreCase);
}
