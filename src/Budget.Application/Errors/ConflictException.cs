namespace Budget.Application;

// A unique constraint was lost to a concurrent write. The unit of work that failed has been discarded.
public sealed class ConflictException(string code, string message, Exception? inner = null) : Exception(message, inner)
{
    public string Code { get; } = code;
}
