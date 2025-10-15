﻿using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Hubs;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.DTOs;
using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Application.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UserProfileController : BaseApiController // Kế thừa từ BaseApiController
    {
        private readonly TradeFinanceDbContext _context;
        private readonly IHubContext<PresenceHub, IPresenceClient> _presenceHub;
        private readonly IUserService _userService; // Thêm IUserService
        private readonly ILogger<UserProfileController> _logger;
        private readonly PresenceTracker _presenceTracker; // Add PresenceTracker

        public UserProfileController(
            TradeFinanceDbContext context,
            IHubContext<PresenceHub, IPresenceClient> presenceHub,
            IUserService userService,
            ILogger<UserProfileController> logger,
            PresenceTracker presenceTracker) // Inject PresenceTracker
        {
            _context = context;
            _presenceHub = presenceHub;
            _userService = userService;
            _logger = logger;
            _presenceTracker = presenceTracker;
        }

        [HttpGet("profile")]
        public async Task<IActionResult> GetProfile()
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();
            var result = await _userService.GetProfileAsync(userId);
            return result.Success ? Ok(result) : NotFound(result);
        }

        [HttpPut("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateUserProfileDto updateDto)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();
            var result = await _userService.UpdateProfileAsync(userId, updateDto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("avatar")]
        public async Task<IActionResult> UploadAvatar(IFormFile file)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();
            var result = await _userService.UploadAvatarAsync(userId, file);
            return result.Success ? Ok(result) : BadRequest(result);
        }
        [HttpPost("toggle-email-notifications")]
        public async Task<IActionResult> ToggleEmailNotifications()
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized(new { Success = false, Message = "User not found." });
            }

            var settings = await _context.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId);

            if (settings == null)
            {
                // Nếu người dùng chưa có cài đặt, tạo mới và bật lên
                settings = new UserSettings { UserId = userId, EmailNotificationEnabled = true };
                _context.UserSettings.Add(settings);
            }
            else
            {
                // If it exists, toggle the value
                settings.EmailNotificationEnabled = !settings.EmailNotificationEnabled;
            }

            await _context.SaveChangesAsync();

            return Ok(new 
            {
                Success = true,
                Message = "Email notification settings updated successfully.",
                Data = settings.EmailNotificationEnabled
            });
        }
        [HttpGet("settings")]
        public async Task<IActionResult> GetSettings()
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();
            var result = await _userService.GetSettingsAsync(userId);
            return result.Success ? Ok(result) : NotFound(result);
        }

        [HttpPut("settings")]
        public async Task<IActionResult> UpdateSettings([FromBody] UserSettingsDto settingsDto)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            // --- FIX: Handle ShowOnlineStatus change specifically to broadcast real-time updates ---
            var currentSettings = await _context.UserSettings.AsNoTracking().FirstOrDefaultAsync(s => s.UserId == userId);
            bool showOnlineStatusChanged = currentSettings?.ShowOnlineStatus != settingsDto.ShowOnlineStatus;

            var result = await _userService.UpdateSettingsAsync(userId, settingsDto);

            if (result.Success && showOnlineStatusChanged)
            {
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    var userConnections = await _presenceTracker.GetConnectionsForUser(userId.ToString());
                    bool isActuallyConnected = userConnections != null && userConnections.Any();

                    user.IsOnline = isActuallyConnected && settingsDto.ShowOnlineStatus;
                    if (!user.IsOnline) user.LastSeen = DateTime.UtcNow;

                    await _context.SaveChangesAsync();

                    await _presenceHub.Clients.All.PresenceSettingChanged(new { userId = userId.ToString(), showOnlineStatus = settingsDto.ShowOnlineStatus, isOnline = user.IsOnline, lastSeen = user.LastSeen });
                }
            }

            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto changePasswordDto)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();
            var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
            var result = await _userService.ChangePasswordAsync(userId, changePasswordDto, ipAddress);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpGet("login-history")]
        public async Task<IActionResult> GetLoginHistory([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();
            var result = await _userService.GetLoginHistoryAsync(userId, page, pageSize);
            return Ok(result);
        }

        [HttpGet("export-settings")]
        public async Task<IActionResult> ExportSettings()
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            var result = await _userService.ExportSettingsAsync(userId);

            if (!result.Success || result.Data == null)
            {
                return BadRequest(result);
            }

            // FIX: Return a JSON file directly with the correct content type.
            return File(result.Data, "application/json", $"datk-settings-{DateTime.UtcNow:yyyy-MM-dd}.json");
        }

        [HttpPost("import-settings")]
        public async Task<IActionResult> ImportSettings([FromBody] ImportSettingsDto importDto)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            var result = await _userService.ImportSettingsAsync(userId, importDto);

            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("settings/presence")]
        public async Task<IActionResult> UpdatePresenceSetting([FromBody] UpdatePresenceSettingDto payload)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            var userSettings = await _context.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId);
            var user = await _context.Users.FindAsync(userId);

            if (userSettings == null || user == null)
            {
                return NotFound(new { message = "User or settings not found." });
            }

            userSettings.ShowOnlineStatus = payload.ShowOnlineStatus;

            // --- FIX: Logic xử lý trạng thái online/offline khi thay đổi cài đặt ---
            // Thay vì gửi UserIsOnline/Offline, chúng ta gửi một sự kiện chuyên biệt
            // để client biết rằng chỉ có cài đặt thay đổi, không phải trạng thái kết nối.
            var userConnections = await _presenceTracker.GetConnectionsForUser(userId.ToString());
            bool isActuallyConnected = userConnections != null && userConnections.Any();

            // Cập nhật trạng thái 'IsOnline' trong DB để nhất quán khi tải lại trang.
            // Trạng thái online thực tế chỉ là true khi user kết nối VÀ cho phép hiển thị.
            user.IsOnline = isActuallyConnected && payload.ShowOnlineStatus;
            if (!user.IsOnline)
            {
                user.LastSeen = DateTime.UtcNow;
            }

            // FIX: Save changes to the database. This was the missing piece.
            // Without this, the settings update was never persisted.
            await _context.SaveChangesAsync();

            // Gửi sự kiện mới đến tất cả các client khác.
            // Client sẽ dùng thông tin này để cập nhật UI mà không cần gọi lại API.
            // FIX: Gửi cho tất cả mọi người, client sẽ tự bỏ qua nếu là chính mình.
            await _presenceHub.Clients.All.PresenceSettingChanged(new { userId = userId.ToString(), showOnlineStatus = payload.ShowOnlineStatus, isOnline = user.IsOnline, lastSeen = user.LastSeen });

            return NoContent();
        }
    }

    public class UpdatePresenceSettingDto
    {
        public bool ShowOnlineStatus { get; set; }
    }
}