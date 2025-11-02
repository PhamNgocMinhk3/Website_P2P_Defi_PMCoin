using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    public abstract class BaseApiController : ControllerBase
    {
        protected bool TryGetCurrentUserId(out Guid userId)
        {
            userId = Guid.Empty;
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdClaim))
            {
                return false;
            }
            return Guid.TryParse(userIdClaim, out userId);
        }
    }
}