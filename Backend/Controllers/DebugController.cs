using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Services;
using System.Linq;
using System.Threading.Tasks;
using System;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin")] // QUAN TRỌNG: Chỉ Admin mới có thể truy cập API này
    public class DebugController : ControllerBase
    {
        private readonly IGameSessionManagementService _sessionManagementService;
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<DebugController> _logger;

        public DebugController(
            IGameSessionManagementService sessionManagementService,
            TradeFinanceDbContext context,
            ILogger<DebugController> logger)
        {
            _sessionManagementService = sessionManagementService;
            _context = context;
            _logger = logger;
        }

        public class ForceResolveRequest
        {
            public string UserAddress { get; set; } = string.Empty;
            public string Result { get; set; } = string.Empty; // "WIN", "LOSE", hoặc "DRAW"
        }

        [HttpPost("force-resolve-bet")]
        public async Task<IActionResult> ForceResolveBet([FromBody] ForceResolveRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.UserAddress) || string.IsNullOrEmpty(request.Result))
            {
                return BadRequest(new { message = "Request body is invalid. UserAddress and Result are required." });
            }

            _logger.LogInformation("DEBUG API: Attempting to force-resolve the latest bet for user {UserAddress} with result {Result}", request.UserAddress, request.Result);

            // FIX: Tìm ván cược gần nhất của người dùng, bất kể đã xử lý hay chưa, để phục vụ cho việc debug/ghi đè.
            var betToResolve = await _context.ActiveBets
                .Where(b => b.UserAddress.ToLower() == request.UserAddress.ToLower())
                .OrderByDescending(b => b.CreatedAt)
                .FirstOrDefaultAsync();

            if (betToResolve == null)
            {
                _logger.LogError("DEBUG API: No active, unsettled bet found for user {UserAddress}", request.UserAddress);
                return NotFound($"No active, unsettled bet found for user {request.UserAddress}.");
            }

            try
            {
                // KIỂM TRA QUAN TRỌNG: Ván cược phải có ContractBetId để có thể xử lý on-chain.
                // Nếu thiếu, đây là một lỗi nghiêm trọng về dữ liệu từ lúc đặt cược.
                if (!betToResolve.ContractBetId.HasValue || betToResolve.ContractBetId.Value <= 0)
                {
                    _logger.LogCritical("DEBUG API: Không thể xử lý cược {BetId} vì thiếu ContractBetId. Đây là lỗi nghiêm trọng về dữ liệu.", betToResolve.Id);
                    return StatusCode(500, new { message = $"Cannot resolve bet {betToResolve.Id} due to missing ContractBetId. This is a critical data integrity issue." });
                }

                // Gọi hàm xử lý thủ công tập trung, hàm này sẽ lo toàn bộ logic on-chain và off-chain.
                var (success, message) = await _sessionManagementService.ManuallySettleSingleBetAsync(betToResolve, request.Result.ToUpper());

                return success
                    ? Ok(new { message = $"Successfully processed manual settlement for bet {betToResolve.Id}.", details = message })
                    : StatusCode(500, new { message = $"Failed to resolve bet {betToResolve.Id}.", reason = message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DEBUG API: An exception occurred while force-resolving bet {BetId}", betToResolve.Id);
                return StatusCode(500, $"An error occurred: {ex.Message}");
            }
        }
    }
}
