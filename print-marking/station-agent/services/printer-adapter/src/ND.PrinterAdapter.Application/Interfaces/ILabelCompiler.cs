using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Domain.Entities;

namespace ND.PrinterAdapter.Application.Interfaces;

public interface ILabelCompiler
{
    PrinterLanguage Language { get; }
    Task<CompiledLabel> CompileAsync(LabelTemplateVersion template, LabelRenderData data,
        PrinterProfile printer, CancellationToken cancellationToken = default);
}
