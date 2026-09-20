using System.Text.Json.Serialization;
using Azure.Identity;
using Budget.Api;
using Budget.Application;
using Budget.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication(builder.Configuration["Auth:AllowedOids"]?.Split(','))
    .AddInfrastructure(builder.Configuration.GetConnectionString("Budget"))
    .AddHttpContextAccessor()
    .AddScoped<ICurrentUser, HttpCurrentUser>();

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// By default an unreadable body throws only in Development. Always throwing sends it through the one exception handler.
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
builder.Services.AddExceptionHandler<ProblemExceptionHandler>();
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = context =>
    context.ProblemDetails.Extensions.TryAdd("code", $"http.{context.ProblemDetails.Status}"));

// The session cookie and the antiforgery tokens are protected by this key ring. In Azure it lives in Blob Storage, reached with
// the managed identity, so sessions survive a deployment and every replica reads the same keys. Locally it is the default.
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("budget");
if (builder.Configuration["DataProtection:BlobUri"] is { Length: > 0 } blobUri)
{
    dataProtection.PersistKeysToAzureBlobStorage(new Uri(blobUri), new DefaultAzureCredential());
}

// Recognises a session on every request. Issuing one is separate: /auth/demo, and Entra through /auth/login.
// An API answers 401 and 403; it never redirects to a login page.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "budget.session";
    // A real session slides for thirty days. The demo session sets its own fixed expiry and opts out of sliding.
    o.ExpireTimeSpan = TimeSpan.FromDays(30);
    o.SlidingExpiration = true;
    o.Cookie.HttpOnly = true;
    // Always Secure, except in Development: curl and Safari will not send a Secure cookie back over http://localhost,
    // which is what docker compose and the Vite proxy use. There it follows the request, so https still gets Secure.
    o.Cookie.SecurePolicy = Csrf.SecurePolicy(builder.Environment);
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Events.OnRedirectToLogin = context => Status(context.Response, StatusCodes.Status401Unauthorized);
    o.Events.OnRedirectToAccessDenied = context => Status(context.Response, StatusCodes.Status403Forbidden);
}).AddEntraSignIn(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddCsrf(builder.Environment);
builder.Services.AddBudgetRateLimiting(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
// The built SPA. Ahead of the rate limiter, so the files of one page load do not spend the API's allowance.
app.UseStaticFiles(Spa.Files);
// Before authentication, so a flood of anonymous requests is limited too.
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Liveness must not touch the database: a slow database should not get the container restarted.
app.MapGet("/health", () => Results.Ok());
app.MapGet("/health/ready", async (BudgetDbContext db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct) ? Results.Ok() : Results.StatusCode(StatusCodes.Status503ServiceUnavailable));

app.MapCsrf();
app.MapAuth(app.Configuration);

var api = app.MapGroup("/api").RequireAuthorization().RequireCsrfToken();
api.MapMe();
api.MapCycles();
api.MapCategories();
api.MapTransactions();
// An unmatched /api path is a 404 for a signed-in caller and a 401 for anyone else, never the SPA's index.html.
api.MapFallback(() => Results.NotFound());

app.MapSpaFallback();

app.Run();

static Task Status(HttpResponse response, int status)
{
    response.StatusCode = status;
    return Task.CompletedTask;
}
