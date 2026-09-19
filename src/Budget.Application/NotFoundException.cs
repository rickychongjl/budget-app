namespace Budget.Application;

// Also what another user's id looks like: the tenant filter makes the row not exist, and the API must not say otherwise.
public sealed class NotFoundException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
