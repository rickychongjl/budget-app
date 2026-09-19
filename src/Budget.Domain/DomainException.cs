namespace Budget.Domain;

// Code is a stable identifier for the API layer; Message is for humans.
public sealed class DomainException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
