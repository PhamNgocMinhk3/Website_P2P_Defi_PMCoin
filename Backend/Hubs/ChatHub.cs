using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace TradeFinanceBackend.Hubs
{
    [Authorize]
    public class ChatHub : Hub<IChatClient> // QUAN TRỌNG: Kế thừa từ Hub<IChatClient>
    {
        // Simple call signaling methods - minimal implementation so clients can notify each other
        // Note: this implementation uses Clients.User(userId) which relies on the app's IUserIdProvider
        // mapping the SignalR user identifier to the same value as ClaimTypes.NameIdentifier.
        public override async Task OnConnectedAsync()
        {
            // Logic khi user kết nối (ví dụ: cập nhật trạng thái online)
            var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrEmpty(userId))
            {
                // Bạn có thể thêm logic cập nhật trạng thái online ở đây
            }
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Logic khi user ngắt kết nối
            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinChat(string chatId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, chatId);
        }

        public async Task LeaveChat(string chatId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatId);
        }

        // Caller invokes this to request a call to a specific user
        public async Task CallUser(string targetUserId, string callId, string callType, string conversationId)
        {
            var fromUser = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
            var fromName = Context.User?.Identity?.Name ?? string.Empty;

            var payload = new {
                CallId = callId,
                FromUserId = fromUser,
                FromUserName = fromName,
                CallType = callType,
                ConversationId = conversationId
            };

            // Send incoming call notification to the target user
            await Clients.User(targetUserId).IncomingCall(payload);
        }

        // Callee accepts the call - notify the caller
        public async Task AcceptCall(string callerUserId, string callId)
        {
            var payload = new {
                CallId = callId,
                FromUserId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
            };
            await Clients.User(callerUserId).CallAccepted(payload);
        }

        // Callee rejects the call - notify the caller
        public async Task RejectCall(string callerUserId, string callId)
        {
            var payload = new {
                CallId = callId,
                FromUserId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
            };
            await Clients.User(callerUserId).CallRejected(payload);
        }

        // Either party can end a call and notify the remote
        public async Task EndCall(string remoteUserId, string callId)
        {
            var payload = new {
                CallId = callId,
                FromUserId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
            };
            await Clients.User(remoteUserId).CallEnded(payload);
        }
    }
}