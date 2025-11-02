using Microsoft.AspNetCore.Authentication;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace TradeFinanceBackend.Middleware
{
    public class SessionAuthenticationMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<SessionAuthenticationMiddleware> _logger;
        private readonly IConfiguration _configuration;

        public SessionAuthenticationMiddleware(RequestDelegate next, ILogger<SessionAuthenticationMiddleware> logger, IConfiguration configuration)
        {
            _next = next;
            _logger = logger;
            _configuration = configuration;
        }

        public async Task InvokeAsync(HttpContext context, TradeFinanceDbContext dbContext)
        {
            // Skip authentication for certain paths
            var path = context.Request.Path.Value?.ToLower();
            var isPublicPath = path != null && (
                path.StartsWith("/api/auth/login") ||
                path.StartsWith("/api/auth/register") ||
                path.StartsWith("/api/auth/forgot-password") ||
                path.StartsWith("/api/auth/reset-password") ||
                path.StartsWith("/api/auth/verify-email") ||
                path.StartsWith("/api/auth/refresh") ||
                path.StartsWith("/api/auth/logout") ||
                path.StartsWith("/api/p2p/prices") ||
                path.StartsWith("/api/p2p/calculate-price") ||
                (path.StartsWith("/api/p2p/orders") && context.Request.Method == "GET") ||
                path.StartsWith("/api/game/") ||  // Allow game endpoints without session
                path == "/api/smartcontract/contract-stats" || // ONLY contract-stats is public
                path.StartsWith("/gamehub") ||  // Allow SignalR hub
                path.StartsWith("/swagger") ||
                path.StartsWith("/health") ||
                path == "/" ||
                path.StartsWith("/favicon.ico") ||
                path.StartsWith("/assets/"));

            if (isPublicPath)
            {
                await _next(context);
                return;
            }

            // Try to get sessionId from cookie
            if (context.Request.Cookies.TryGetValue("sessionId", out var sessionId) && !string.IsNullOrEmpty(sessionId))
            {
                try
                {
                    // Get session from database
                    if (!Guid.TryParse(sessionId, out var sessionGuid))
                    {
                        await _next(context);
                        return;
                    }

                    var session = await dbContext.UserSessions
                        .Include(s => s.User)
                        .FirstOrDefaultAsync(s => s.Id == sessionGuid && s.IsActive && s.ExpiryDate > DateTime.UtcNow);

                    if (session != null && session.User != null)
                    {
                        // Create claims for the authenticated user
                        var claims = new List<Claim>
                        {
                            new(ClaimTypes.NameIdentifier, session.User.Id.ToString()),
                            new(ClaimTypes.Email, session.User.Email),
                            new(ClaimTypes.Name, $"{session.User.FirstName} {session.User.LastName}".Trim()),
                            new(ClaimTypes.Role, session.User.Role),
                            new("userId", session.User.Id.ToString()),
                            new("sessionId", session.Id.ToString())
                        };

                        var identity = new ClaimsIdentity(claims, "SessionAuth");
                        var principal = new ClaimsPrincipal(identity);

                        // Set the user context
                        context.User = principal;

                        // Add UserId to HttpContext.Items for controllers
                        context.Items["UserId"] = session.User.Id;
                        context.Items["SessionId"] = session.Id;

                        // Update last accessed time
                        session.LastAccessedAt = DateTime.UtcNow;
                        await dbContext.SaveChangesAsync();


                    }
                    else
                    {
                        _logger.LogDebug($"Invalid or expired session: {sessionId}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Session authentication failed: {ex.Message}");
                }
            }
            else
            {
                // Only log warning for protected paths that require authentication
                var isProtectedPath = path != null && (
                    path.StartsWith("/api/userprofile") ||
                    path.StartsWith("/api/p2p/orders") && context.Request.Method != "GET" ||
                    path.StartsWith("/api/p2p/transactions") ||
                    path.StartsWith("/api/admin"));

                if (isProtectedPath)
                {
                    _logger.LogWarning($"No sessionId cookie found for protected path: {path}");
                }
                else
                {
                    _logger.LogDebug($"No sessionId cookie found for path: {path}");
                }
            }

            await _next(context);
        }
    }
}
