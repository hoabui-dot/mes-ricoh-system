using FluentValidation;
using System.Text.Json;
using ND.PrinterAdapter.Application.DTOs;

namespace ND.PrinterAdapter.Application.Validation;

public class CreateTemplateRequestValidator : AbstractValidator<CreateTemplateRequest>
{
    public CreateTemplateRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Template Name is required.")
            .MaximumLength(100).WithMessage("Template Name cannot exceed 100 characters.");

        RuleFor(x => x.Dpi)
            .Must(dpi => dpi == 203 || dpi == 300 || dpi == 600)
            .WithMessage("Dpi must be 203, 300, or 600.");

        RuleFor(x => x.LabelWidth)
            .GreaterThan(0).WithMessage("Label width must be greater than 0.")
            .LessThanOrEqualTo(500).WithMessage("Label width cannot exceed 500 mm.");

        RuleFor(x => x.LabelHeight)
            .GreaterThan(0).WithMessage("Label height must be greater than 0.")
            .LessThanOrEqualTo(500).WithMessage("Label height cannot exceed 500 mm.");

        RuleFor(x => x.TemplateJson)
            .NotEmpty().WithMessage("Template JSON is required.")
            .Must(BeValidJson).WithMessage("Template JSON must be a valid JSON string.");
    }

    private bool BeValidJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return true;
        }
        catch
        {
            return false;
        }
    }
}

public class UpdateTemplateRequestValidator : AbstractValidator<UpdateTemplateRequest>
{
    public UpdateTemplateRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Template Name is required.")
            .MaximumLength(100).WithMessage("Template Name cannot exceed 100 characters.");

        RuleFor(x => x.Dpi)
            .Must(dpi => dpi == 203 || dpi == 300 || dpi == 600)
            .WithMessage("Dpi must be 203, 300, or 600.");

        RuleFor(x => x.LabelWidth)
            .GreaterThan(0).WithMessage("Label width must be greater than 0.")
            .LessThanOrEqualTo(500).WithMessage("Label width cannot exceed 500 mm.");

        RuleFor(x => x.LabelHeight)
            .GreaterThan(0).WithMessage("Label height must be greater than 0.")
            .LessThanOrEqualTo(500).WithMessage("Label height cannot exceed 500 mm.");

        RuleFor(x => x.TemplateJson)
            .NotEmpty().WithMessage("Template JSON is required.")
            .Must(BeValidJson).WithMessage("Template JSON must be a valid JSON string.");
    }

    private bool BeValidJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
