using Budget.Application;

namespace Budget.Infrastructure;

// No payment provider is connected yet, so there is never a subscription to cancel.
public sealed class NoBilling : IBilling
{
    public Task CancelForDeletionAsync(Guid userId, CancellationToken ct = default) => Task.CompletedTask;
}
