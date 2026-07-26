using FluentValidation;
using ND.UnifiedContracts.Events;

namespace ND.UnifiedContracts.Validation;

/// <summary>
/// Validates that a UnifiedEvent conforms to the ND Unified Event Protocol.
/// All mandatory fields must be present and non-empty.
/// Invalid payloads must be rejected — never forwarded.
/// </summary>
public sealed class UnifiedEventValidator : AbstractValidator<UnifiedEvent>
{
    public UnifiedEventValidator()
    {
        RuleFor(e => e.EventId)
            .NotEmpty().WithMessage("event_id is mandatory.");

        RuleFor(e => e.Timestamp)
            .NotEmpty().WithMessage("timestamp is mandatory.")
            .Must(BeValidIso8601).WithMessage("timestamp must be a valid ISO 8601 datetime.");

        RuleFor(e => e.Site)
            .NotEmpty().WithMessage("site is mandatory.");

        RuleFor(e => e.Area)
            .NotEmpty().WithMessage("area is mandatory.");

        RuleFor(e => e.Line)
            .NotEmpty().WithMessage("line is mandatory.");

        RuleFor(e => e.Machine)
            .NotEmpty().WithMessage("machine is mandatory.");

        RuleFor(e => e.EdgeId)
            .NotEmpty().WithMessage("edge_id is mandatory.");

        RuleFor(e => e.Data)
            .NotNull().WithMessage("data array is required.")
            .Must(d => d.Count > 0).WithMessage("data array must contain at least one tag.");

        RuleForEach(e => e.Data).SetValidator(new UnifiedTagValidator());
    }

    private static bool BeValidIso8601(string timestamp)
        => DateTimeOffset.TryParse(timestamp, out _);
}

public sealed class UnifiedTagValidator : AbstractValidator<UnifiedTag>
{
    public UnifiedTagValidator()
    {
        RuleFor(t => t.Tag).NotEmpty().WithMessage("tag name is required.");
        RuleFor(t => t.Quality)
            .NotEmpty()
            .Must(q => q is EventQuality.Good or EventQuality.Bad or EventQuality.Uncertain or EventQuality.Missing)
            .WithMessage("quality must be GOOD, BAD, UNCERTAIN, or MISSING.");
    }
}
