using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Services;
using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Models.DTOs;
using Microsoft.AspNetCore.SignalR;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Hubs;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ChatController : BaseApiController
    {
        private readonly IChatService _chatService;
        private readonly IHubContext<ChatHub, IChatClient> _hubContext;
        private readonly TradeFinanceBackend.Data.TradeFinanceDbContext _context;
        private readonly ILogger<ChatController> _logger;
        public ChatController(IChatService chatService, IHubContext<ChatHub, IChatClient> hubContext, TradeFinanceBackend.Data.TradeFinanceDbContext context, ILogger<ChatController> logger)
        {
            _chatService = chatService;
            _hubContext = hubContext;
            _context = context;
            _logger = logger;
        }

        [HttpGet("conversations")]
        public async Task<IActionResult> GetConversations()
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }
            var conversations = await _chatService.GetUserConversationsAsync(userId);
            return Ok(conversations);
        }

        [HttpGet("{conversationId}/messages")]
        public async Task<IActionResult> GetMessages(Guid conversationId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }
            var messages = await _chatService.GetMessagesAsync(conversationId, userId, page, pageSize);
            return Ok(messages);
        }

        [HttpPost("one-on-one")]
        public async Task<IActionResult> CreateOrGetOneOnOneChat([FromBody] CreateOneOnOneChatDto payload)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }
            var chat = await _chatService.CreateOrGetOneOnOneChatAsync(currentUserId, payload.TargetUserId);
            return Ok(chat);
        }

        [HttpPost("groups")]
        public async Task<IActionResult> CreateGroup([FromBody] CreateGroupDto payload)
        {
            if (!TryGetCurrentUserId(out var creatorId))
            {
                return Unauthorized(new { message = "User not authorized." });
            }

            // Ensure the creator is not in the member list to avoid duplicates
            payload.MemberIds.Remove(creatorId);

            var chatDto = await _chatService.CreateGroupAsync(payload.Name, payload.MemberIds, creatorId);

            // TODO: Broadcast the new group creation to all members via SignalR
            // so their conversation lists update in real-time.

            return Ok(chatDto);
        }

        [HttpGet("{conversationId}/members")]
        public async Task<IActionResult> GetGroupMembers(Guid conversationId)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }
            var members = await _chatService.GetGroupMembersAsync(conversationId, userId);
            return Ok(members);
        }

        [HttpPut("groups/{conversationId}/members/{memberId}/role")]
        public async Task<IActionResult> UpdateMemberRole(Guid conversationId, Guid memberId, [FromBody] UpdateRoleDto payload)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var (success, message) = await _chatService.UpdateMemberRoleAsync(conversationId, memberId, payload.Role, currentUserId);

            if (!success)
            {
                return BadRequest(new { message });
            }

            // FIX: Broadcast a real-time event to all group members to notify them of the role change.
            var memberIds = await _context.ChatParticipants
                .Where(p => p.ChatId == conversationId)
                .Select(p => p.UserId.ToString())
                .ToListAsync();

            await _hubContext.Clients.Users(memberIds).MemberRoleChanged(new { conversationId, memberId, role = payload.Role });

            return Ok(new { message });
        }

        [HttpDelete("groups/{conversationId}/members/{memberId}")]
        public async Task<IActionResult> KickMember(Guid conversationId, Guid memberId)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            // Lấy danh sách thành viên TRƯỚC KHI xóa để gửi sự kiện
            var chat = await _context.Chats
                .AsNoTracking()
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null) return NotFound("Group not found.");

            var (success, message) = await _chatService.KickMemberAsync(conversationId, memberId, currentUserId);

            if (!success)
            {
                return BadRequest(new { message });
            }

            // Gửi sự kiện đến tất cả thành viên trong nhóm (bao gồm cả người bị kick)
            // để họ cập nhật UI của mình.
            var allParticipantIds = chat.Participants.Select(p => p.UserId.ToString()).ToList();
            await _hubContext.Clients.Users(allParticipantIds)
                .MemberKicked(new { conversationId, memberId = memberId.ToString() });

            return Ok(new { message });
        }

        [HttpPost("groups/{conversationId}/transfer-ownership")]
        public async Task<IActionResult> TransferOwnership(Guid conversationId, [FromBody] TransferOwnershipDto payload)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var (success, message) = await _chatService.TransferOwnershipAsync(conversationId, payload.NewOwnerId, currentUserId);

            if (!success)
            {
                return BadRequest(new { message });
            }

            return Ok(new { message });
        }

        [HttpPost("messages")]
        public async Task<IActionResult> SendMessage([FromBody] CreateMessageDto payload)
        {
            if (!TryGetCurrentUserId(out var senderId))
            {
                return Unauthorized();
            }

            // Kiểm tra xem người dùng có bị chặn trong cuộc trò chuyện 1-1 không
            var canSend = await _chatService.CanSendMessageAsync(payload.ChatId, senderId);
            if (!canSend)
            {
                return Forbid("You are blocked from sending messages in this chat.");
            }

            // FIX: Real-time for new conversations.
            // Before sending the message, check if the recipient has this conversation in their list.
            // If not, send an 'AddedToGroup' event to them first.
            var recipientId = await _context.ChatParticipants
                .Where(p => p.ChatId == payload.ChatId && p.UserId != senderId)
                .Select(p => p.UserId)
                .FirstOrDefaultAsync();

            if (recipientId != Guid.Empty)
            {
                // Check if the recipient is already a participant. This is a proxy for "has the conversation".
                var recipientHasChat = await _context.ChatParticipants.AnyAsync(p => p.ChatId == payload.ChatId && p.UserId == recipientId);
                if (!recipientHasChat)
                {
                    // If they don't have it, create the DTO for them and send it.
                    var chatDtoForRecipient = await _chatService.CreateOrGetOneOnOneChatAsync(recipientId, senderId);
                    await _hubContext.Clients.User(recipientId.ToString()).AddedToGroup(chatDtoForRecipient);
                }
            }

            var messageDto = await _chatService.SendMessageAsync(payload.ChatId, senderId, payload.Content, payload.Type);

            // Lấy danh sách người nhận hợp lệ (không bị chặn) và phát tin nhắn qua SignalR
            var recipientIds = await _chatService.GetValidRecipientsAsync(payload.ChatId, senderId);
            // FIX: Send message directly to users instead of a group they might not have joined yet.
            // This ensures real-time delivery for new conversations and existing ones.
            await _hubContext.Clients.Users(recipientIds).ReceiveMessage(messageDto);

            return Ok(messageDto);
        }

        [HttpDelete("conversations/{conversationId}")]
        public async Task<IActionResult> DeleteConversation(Guid conversationId)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var (success, participantIds) = await _chatService.DeleteConversationAsync(conversationId.ToString(), userId.ToString());

            if (!success)
            {
                return NotFound(new { message = "Conversation not found or you do not have permission to delete it." });
            }

            // FIX: Broadcast the deletion event to all participants.
            await _hubContext.Clients.Users(participantIds).ConversationDeleted(new { conversationId });

            return NoContent();
        }

        [HttpPut("conversations/{conversationId}/read")]
        public async Task<IActionResult> MarkAsRead(Guid conversationId)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            await _chatService.MarkMessagesAsReadAsync(conversationId, userId);

            return NoContent(); // 204 No Content is appropriate here
        }

        [HttpPost("groups/{conversationId}/leave")]
        public async Task<IActionResult> LeaveGroup(Guid conversationId)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            var (success, message, memberIds) = await _chatService.LeaveGroupAsync(conversationId, userId); // This should now work

            if (!success)
            {
                return BadRequest(new { message });
            }

            // Gửi sự kiện cho các thành viên còn lại và chính người vừa rời nhóm
            if (memberIds.Any())
            {
                await _hubContext.Clients.Users(memberIds).MemberLeft(new { conversationId, memberId = userId.ToString() });
            }

            return Ok(new { message });
        }

        [HttpGet("groups/{conversationId}/pending-members")]
        public async Task<IActionResult> GetPendingMembers(Guid conversationId)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            var (success, members, message) = await _chatService.GetPendingMembersAsync(conversationId, userId); // This should now work

            if (!success)
            {
                return Forbid(message);
            }

            return Ok(members);
        }

        [HttpPost("groups/{conversationId}/members/{memberId}/approve")]
        public async Task<IActionResult> ApprovePendingMember(Guid conversationId, Guid memberId)
        {
            if (!TryGetCurrentUserId(out var adminId)) return Unauthorized();

            var (success, message, newMember, allMemberIds) = await _chatService.ApprovePendingMemberAsync(conversationId, memberId, adminId); // This should now work

            if (!success)
            {
                return BadRequest(new { message });
            }

            // Gửi sự kiện cho thành viên mới và các thành viên cũ
            if (newMember != null && allMemberIds != null)
            {
                await _hubContext.Clients.User(memberId.ToString()).AddedToGroup(newMember);
                await _hubContext.Clients.Users(allMemberIds).MembersAdded(new { conversationId, newMemberIds = new List<Guid> { memberId } });
            }

            return Ok(new { message });
        }

        [HttpDelete("groups/{conversationId}/members/{memberId}/reject")]
        public async Task<IActionResult> RejectPendingMember(Guid conversationId, Guid memberId)
        {
            if (!TryGetCurrentUserId(out var adminId)) return Unauthorized();

            // Lấy danh sách admin/owner TRƯỚC KHI xóa để gửi sự kiện
            var adminsToNotify = await _context.ChatParticipants
                .Where(p => p.ChatId == conversationId && (p.Role == ChatRole.Owner || p.Role == ChatRole.Admin))
                .Select(p => p.UserId.ToString())
                .ToListAsync();

            var (success, message) = await _chatService.RejectPendingMemberAsync(conversationId, memberId, adminId); // This should now work

            if (!success)
            {
                return BadRequest(new { message });
            }

            // Gửi sự kiện đến các admin/owner để họ làm mới danh sách chờ
            await _hubContext.Clients.Users(adminsToNotify).MemberKicked(new { conversationId, memberId = memberId.ToString() });

            return Ok(new { message });
        }

        [HttpPut("groups/{conversationId}/settings")]
        public async Task<IActionResult> UpdateGroupSettings(Guid conversationId, [FromBody] GroupSettingsDto payload)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var (success, message) = await _chatService.UpdateGroupSettingsAsync(conversationId, currentUserId, payload); // This should now work

            if (!success)
            {
                return BadRequest(new { message });
            }

            // Gửi sự kiện real-time đến các thành viên trong nhóm
            var memberIds = await _context.ChatParticipants
                .Where(p => p.ChatId == conversationId)
                .Select(p => p.UserId.ToString())
                .ToListAsync();
            await _hubContext.Clients.Users(memberIds).GroupSettingsUpdated(new { conversationId, settings = payload }); // This should now work

            return Ok(new { message });
        }

        [HttpDelete("groups/{conversationId}")]
        public async Task<IActionResult> DisbandGroup(Guid conversationId)
        {
            if (!TryGetCurrentUserId(out var currentUserId)) return Unauthorized();

            var (success, message, memberIds) = await _chatService.DisbandGroupAsync(conversationId, currentUserId); // This should now work
            if (!success) return BadRequest(new { message });

            if (memberIds != null && memberIds.Any())
            {
                await _hubContext.Clients.Users(memberIds).GroupDisbanded(new { conversationId });
            }
            return Ok(new { message });
        }

        [HttpPost("groups/{conversationId}/members")]
        public async Task<IActionResult> AddMembers(Guid conversationId, [FromBody] AddMembersDto payload)
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var (success, message, wasAddedToPending) = await _chatService.AddMembersToGroupAsync(conversationId, payload.MemberIds, currentUserId);

            if (!success)
            {
                return BadRequest(new { message });
            }

            // Trả về một đối tượng chứa thông điệp và trạng thái để frontend biết cách hiển thị thông báo
            return Ok(new
            {
                message, wasAddedToPending
            });
        }

        [HttpPost("messages/{messageId}/appointments/accept")]
        public async Task<IActionResult> AcceptAppointment(Guid messageId)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var (success, updatedData, chatId) = await _chatService.AcceptAppointmentAsync(messageId, userId);

            if (!success || !chatId.HasValue || updatedData == null)
            {
                return BadRequest(new { message = "Could not accept appointment." });
            }

            // Broadcast the update to all members of the chat group
            await _hubContext.Clients.Group(chatId.Value.ToString()).AppointmentUpdated(new { messageId, appointmentData = updatedData });

            return Ok(updatedData);
        }

        [HttpPost("messages/{messageId}/appointments/decline")]
        public async Task<IActionResult> DeclineAppointment(Guid messageId)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var (success, updatedData, chatId) = await _chatService.DeclineAppointmentAsync(messageId, userId);

            if (!success || !chatId.HasValue || updatedData == null)
            {
                return BadRequest(new { message = "Could not decline or leave the appointment." });
            }

            // Broadcast the update to all members of the chat group
            await _hubContext.Clients.Group(chatId.Value.ToString()).AppointmentUpdated(new { messageId, appointmentData = updatedData });

            return Ok(updatedData);
        }
    }
}