using Budget.Application;
using Budget.Domain;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Budget.Api;

// The one place an exception becomes a status code. Anything not listed is a 500 with no detail.
internal sealed class ProblemExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        var (status, code) = exception switch
        {
            NotFoundException e => (StatusCodes.Status404NotFound, e.Code),
            DomainException e => (StatusCodes.Status422UnprocessableEntity, e.Code),
            _ => (0, ""),
        };

        if (status == 0)
        {
            return false;
        }

        context.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails { Status = status, Detail = exception.Message, Extensions = { ["code"] = code } },
        });
    }
}
