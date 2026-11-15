using Budget.Domain;
using Microsoft.Extensions.Logging;

namespace Budget.Application;

// The word the person types to confirm. Null when the body was missing, which is refused the same way as a wrong word.
public sealed record DeleteAccountRequest(string? Confirm);

public enum DeleteAccountOutcome
{
    Deleted,
    // The User row was already gone: an earlier attempt finished, or another device got there first. Not an error.
    AlreadyGone,
}

// Immediate hard delete (decision D5): billing is cancelled, then every row of the user's and the User row go, together.
// Each step is safe to run again, so a retry after a failure part-way finishes the job. The caller signs the session out.
public sealed class DeleteAccount(ICurrentUser currentUser, IUserRepository users, IBilling billing, ILogger<DeleteAccount> logger)
{
    public const string Confirmation = "DELETE";

    public async Task<DeleteAccountOutcome> RunAsync(DeleteAccountRequest? request, CancellationToken ct = default)
    {
        // Exact and in capitals, like the screen asks; only stray spaces from a phone keyboard are forgiven.
        if (request?.Confirm?.Trim() != Confirmation)
        {
            throw new DomainException("account.delete.unconfirmed", $"Type {Confirmation} to confirm.");
        }

        // No identifiers in these lines: the outcome is all an operator needs, and the id would tie a log line to a person.
        var user = await users.GetAsync(currentUser.Id, ct);
        if (user is null)
        {
            logger.LogInformation("Account deletion: the account was already gone.");
            return DeleteAccountOutcome.AlreadyGone;
        }

        if (user.IsDemo)
        {
            // Every visitor shares this row, and the nightly reset needs it.
            logger.LogInformation("Account deletion refused: the demo account cannot be deleted.");
            throw new DomainException("demo.account.undeletable", "The demo account cannot be deleted.");
        }

        // First, so a failure here leaves the account whole rather than a deleted account still being charged.
        await billing.CancelForDeletionAsync(user.Id, ct);
        await users.DeleteAccountAsync(user.Id, ct);

        logger.LogInformation("Account deleted.");
        return DeleteAccountOutcome.Deleted;
    }
}
