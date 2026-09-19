using System.Text.Json;
using Budget.Application;
using Budget.Domain;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Budget.Api;

// The one place an exception becomes a status code. Anything not listed is a 500 with no detail.
internal sealed class ProblemExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        ProblemDetails? problem = exception switch
        {
            ValidationException e => new HttpValidationProblemDetails(e.Errors
                .GroupBy(f => JsonNamingPolicy.CamelCase.ConvertName(f.PropertyName))
                .ToDictionary(g => g.Key, g => g.Select(f => f.ErrorMessage).ToArray()))
            {
                Status = StatusCodes.Status400BadRequest,
                Extensions = { ["code"] = "validation" },
            },
            // A body that does not parse or bind. The framework's message can echo input, so it is not passed on.
            BadHttpRequestException => Problem(StatusCodes.Status400BadRequest, "request.malformed", "The request could not be read."),
            NotFoundException e => Problem(StatusCodes.Status404NotFound, e.Code, e.Message),
            DomainException e => Problem(StatusCodes.Status422UnprocessableEntity, e.Code, e.Message),
            ConflictException e => Problem(StatusCodes.Status409Conflict, e.Code, e.Message),
            _ => null,
        };

        if (problem is null)
        {
            return false;
        }

        context.Response.StatusCode = problem.Status!.Value;
        return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = context, ProblemDetails = problem });
    }

    private static ProblemDetails Problem(int status, string code, string detail) =>
        new() { Status = status, Detail = detail, Extensions = { ["code"] = code } };
}
