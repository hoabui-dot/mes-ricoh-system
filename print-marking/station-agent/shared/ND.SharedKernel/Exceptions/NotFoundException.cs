namespace ND.SharedKernel.Exceptions;

public class NotFoundException : DomainException
{
    public NotFoundException(string entityName, string id)
        : base("NOT_FOUND", $"{entityName} with id '{id}' was not found.")
    {
    }
}
