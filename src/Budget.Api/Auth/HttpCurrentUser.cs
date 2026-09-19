using System.Security.Claims;
using Budget.Application;

namespace Budget.Api;

// The session's user id. Outside a request, or without a session, this is nobody: the tenant filter then returns nothing.
internal sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid Id =>
        Guid.TryParse(accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : Guid.Empty;
}
