namespace Budget.Application;

// Whatever takes payment for a plan. Today nothing does, so Infrastructure registers NoBilling; the store integrations
// (L6 to L8) replace it.
public interface IBilling
{
    // Account deletion calls this first, before any data is deleted, while the scope runs as that user. It must stop the
    // user being charged again and must be safe to call twice: a deletion that failed after this step is retried from the
    // top. A user with no subscription is not an error.
    Task CancelForDeletionAsync(Guid userId, CancellationToken ct = default);
}
