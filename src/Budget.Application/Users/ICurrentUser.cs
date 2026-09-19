namespace Budget.Application;

// Who the request or job scope is acting for. Guid.Empty means nobody: tenant reads return nothing and tenant writes throw.
public interface ICurrentUser
{
    Guid Id { get; }
}
