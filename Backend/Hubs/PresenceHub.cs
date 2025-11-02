﻿﻿﻿using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Application.Services;
using TradeFinanceBackend.Services;
namespace TradeFinanceBackend.Hubs

{
    [Authorize]
    public class PresenceHub : Hub<IPresenceClient>
    {
        private readonly PresenceTracker _tracker;
        private readonly TradeFinanceDbContext _context;
        private readonly IUserService _userService;

        public PresenceHub(PresenceTracker tracker, TradeFinanceBackend.Data.TradeFinanceDbContext context, IUserService userService)
        {
            _tracker = tracker;
            _context = context;
            _userService = userService;
        }

        public override async Task OnConnectedAsync()
        {
            // Lấy UserId từ context của user đã được xác thực
            var userIdString = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out var userId))
            {
                // Nếu không có UserId, không xử lý gì thêm
                await base.OnConnectedAsync();
                return;
            }

            // Gọi tracker để ghi nhận kết nối mới và kiểm tra xem user có vừa online không
            var isFirstConnection = await _tracker.UserConnected(userIdString, Context.ConnectionId);
            if (isFirstConnection)
            {
                // FIX: Do NOT update IsOnline in the database on connect.
                // This state should only be managed when the user explicitly changes their presence setting
                // or when they fully disconnect. This prevents overriding the privacy setting on refresh.
                var userSettings = await _context.UserSettings.FindAsync(userId);
                if (userSettings?.ShowOnlineStatus ?? true)
                {
                    await Clients.Others.UserIsOnline(userIdString);
                }
            }

            // Lấy danh sách tất cả user đang online và gửi cho client vừa kết nối
            var onlineUsers = await _tracker.GetOnlineUsers();
            await Clients.Caller.GetOnlineUsers(onlineUsers);

            // Hoàn tất quá trình kết nối
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var userIdString = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out var userId))
            {
                await base.OnDisconnectedAsync(exception);
                return;
            }

            var isOffline = await _tracker.UserDisconnected(userIdString, Context.ConnectionId);
            if (isOffline)
            {
                // FIX: Update the user's status in the database when they go completely offline.
                // This ensures that when other users refresh, the correct offline status is loaded.
                var lastSeenTime = DateTime.UtcNow;
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    user.IsOnline = false; // <-- Dòng quan trọng bị thiếu
                    user.LastSeen = lastSeenTime;
                    await _context.SaveChangesAsync();
                    await Clients.Others.UserIsOffline(new { userId = userIdString, lastSeen = lastSeenTime });
                }
            }

            await base.OnDisconnectedAsync(exception);
        }
    }
}