using System.Text.Json.Serialization;
using Budget.Api;
using Budget.Application;
using Budget.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration.GetConnectionString("Budget"))
    .AddHttpContextAccessor()
    .AddScoped<ICurrentUser, HttpCurrentUser>();

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// By default an unreadable body throws only in Development. Always throwing sends it through the one exception handler.
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
builder.Services.AddExceptionHandler<ProblemExceptionHandler>();
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = context =>
    context.ProblemDetails.Extensions.TryAdd("code", $"http.{context.ProblemDetails.Status}"));

// Recognises a session on every request. Issuing one is separate: /auth/demo now, Entra in M5.
// An API answers 401 and 403; it never redirects to a login page.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "budget.session";
    o.Cookie.HttpOnly = true;
    // Always Secure, except in Development: curl and Safari will not send a Secure cookie back over http://localhost,
    // which is what docker compose and the Vite proxy use. There it follows the request, so https still gets Secure.
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Events.OnRedirectToLogin = context => Status(context.Response, StatusCodes.Status401Unauthorized);
    o.Events.OnRedirectToAccessDenied = context => Status(context.Response, StatusCodes.Status403Forbidden);
});
builder.Services.AddAuthorization();
builder.Services.AddBudgetRateLimiting(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
// Before authentication, so a flood of anonymous requests is limited too.
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Liveness must not touch the database: a slow database should not get the container restarted.
app.MapGet("/health", () => Results.Ok());
app.MapGet("/health/ready", async (BudgetDbContext db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct) ? Results.Ok() : Results.StatusCode(StatusCodes.Status503ServiceUnavailable));

app.MapAuth();

var api = app.MapGroup("/api").RequireAuthorization();
api.MapMe();
api.MapCycles();
api.MapCategories();
api.MapTransactions();
// An unmatched /api path is a 404 for a signed-in caller and a 401 for anyone else, never the SPA's index.html.
api.MapFallback(() => Results.NotFound());

app.Run();

static Task Status(HttpResponse response, int status)
{
    response.StatusCode = status;
    return Task.CompletedTask;
}
