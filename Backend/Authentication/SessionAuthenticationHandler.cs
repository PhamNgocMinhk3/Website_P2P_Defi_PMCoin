using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace TradeFinanceBackend.Authentication
{
    public class SessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public SessionAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger, UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            // The actual authentication is handled by SessionAuthenticationMiddleware
            // Check if user is authenticated with SessionAuth
            if (Context.User?.Identity?.IsAuthenticated == true)
            {
                // Create a new ticket with our scheme name
                var ticket = new AuthenticationTicket(Context.User, "SessionAuth");
                return Task.FromResult(AuthenticateResult.Success(ticket));
            }

            // If no session authentication, return NoResult (not Fail)
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        protected override Task HandleChallengeAsync(AuthenticationProperties properties)
        {
            // Return 401 for API calls
            Response.StatusCode = 401;
            return Task.CompletedTask;
        }
    }
}
