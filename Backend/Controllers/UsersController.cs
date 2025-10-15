using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Application.Services;
using Microsoft.AspNetCore.SignalR;
using TradeFinanceBackend.Hubs;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    // Định nghĩa lớp để nhận dữ liệu báo cáo
    public class ReportUserPayload
    {
        [Required]
        public string UserId { get; set; } = string.Empty;
        [Required]
        public string Reason { get; set; } = string.Empty;
        public string? CustomReason { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // Yêu cầu người dùng phải đăng nhập
    public class UsersController : BaseApiController
    {
        private readonly IUserService _userService;
        private readonly ILogger<UsersController> _logger;
        private readonly IHubContext<ChatHub> _hubContext;

        public UsersController(IUserService userService, ILogger<UsersController> logger, IHubContext<ChatHub> hubContext)
        {
            _userService = userService;
            _logger = logger;
            _hubContext = hubContext;
        }

        /// <summary>
        /// Tìm kiếm người dùng theo username, email, hoặc tên.
        /// </summary>
        /// <param name="term">Từ khóa tìm kiếm.</param>
        /// <returns>Danh sách người dùng phù hợp.</returns>
        [HttpGet("search")]
        public async Task<IActionResult> SearchUsers([FromQuery] string term)
        {
            if (string.IsNullOrWhiteSpace(term))
            {
                return BadRequest(new { message = "Search term cannot be empty." });
            }

            // Lấy ID của người dùng hiện tại từ token/session
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized(new { message = "Invalid user session." });
            }

            _logger.LogInformation("User {UserId} is searching for term: '{SearchTerm}'", currentUserId, term);

            var result = await _userService.SearchUsersAsync(term, currentUserId);

            return Ok(result);
        }

        // POST: api/users/{userId}/block
        [HttpPost("{userId}/block")]
        public async Task<IActionResult> BlockUser(Guid userId)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized(new { message = "User not authorized." });
            }

            var (success, message, statusCode) = await _userService.BlockUserAsync(currentUserId, userId);
            if (success)
            {
                _logger.LogInformation("User {CurrentUserId} blocked user {UserId}", currentUserId, userId);

                // Notify both users via SignalR
                var blockerSignalRId = currentUserId.ToString();
                var blockedSignalRId = userId.ToString();
                var payload = new { blockerId = currentUserId, blockedId = userId };

                await _hubContext.Clients.User(blockerSignalRId).SendAsync("UserBlocked", payload);
                await _hubContext.Clients.User(blockedSignalRId).SendAsync("UserBlocked", payload);
                return Ok(new { message });
            }
            
            return statusCode switch
            {
                404 => NotFound(new { message }),
                _ => BadRequest(new { message }),
            };
        }

        // DELETE: api/users/{userId}/unblock
        [HttpDelete("{userId}/unblock")]
        public async Task<IActionResult> UnblockUser(Guid userId)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized(new { message = "User not authorized." });
            }

            var (success, message, statusCode) = await _userService.UnblockUserAsync(currentUserId, userId);
            if (success)
            {
                _logger.LogInformation("User {CurrentUserId} unblocked user {UserId}", currentUserId, userId);

                // Notify both users via SignalR
                var unblockerSignalRId = currentUserId.ToString();
                var unblockedSignalRId = userId.ToString();
                var payload = new { unblockerId = currentUserId, unblockedId = userId };
                await _hubContext.Clients.User(unblockerSignalRId).SendAsync("UserUnblocked", payload);
                await _hubContext.Clients.User(unblockedSignalRId).SendAsync("UserUnblocked", payload);
                return Ok(new { message });
            }
            
            // If not successful, it's because the user was not blocked (404 from service).
            return NotFound(new { message });
        }

        // POST: api/users/report
        [HttpPost("report")]
        public IActionResult ReportUser([FromBody] ReportUserPayload payload)
        {
            if (!TryGetCurrentUserId(out var reporterId))
            {
                return Unauthorized(new { message = "User not authorized." });
            }

            // TODO: Implement logic to save the report to the database.
            // For example, create a UserReports table (ReporterId, ReportedId, Reason, CustomReason, Timestamp).
            // await _userService.CreateReportAsync(reporterId, payload.UserId, payload.Reason, payload.CustomReason);

            _logger.LogInformation("User {ReporterId} reported user {ReportedUserId} for reason: {Reason}", reporterId, payload.UserId, payload.Reason);
            return Ok(new { message = "Report submitted successfully." });
        }
    }
}