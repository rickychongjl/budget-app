namespace Budget.Application;

// Signed in somewhere, but not someone this app admits.
public sealed class ForbiddenException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
