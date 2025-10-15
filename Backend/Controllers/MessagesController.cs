using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TradeFinanceBackend.Hubs;
using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/chat/messages")]
    [Authorize]
    public class MessagesController : BaseApiController
    {
        private readonly IChatService _chatService;
        private readonly IHubContext<ChatHub> _hubContext;

        public MessagesController(IChatService chatService, IHubContext<ChatHub> hubContext)
        {
            _chatService = chatService;
            _hubContext = hubContext;
        }

        [HttpDelete("{messageId}")]
        public async Task<IActionResult> DeleteMessage(Guid messageId)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var (success, chatId) = await _chatService.DeleteMessageAsync(messageId, userId);
            if (!success)
            {
                return Forbid(); // Or NotFound() if the message doesn't exist
            }

            if (chatId.HasValue)
            {
                // FIX: Send a single payload object instead of multiple arguments to match client-side handler.
                // FIX 2: Send to all participants of the chat directly by user ID instead of to a group.
                // This ensures the user who is not currently viewing the chat also gets the delete event.
                var participantIds = await _chatService.GetValidRecipientsAsync(chatId.Value, userId);
                await _hubContext.Clients.Users(participantIds).SendAsync("MessageDeleted", new
                {
                    chatId = chatId.Value.ToString(), messageId = messageId.ToString()
                });
            }

            return NoContent();
        }

        [HttpPost("{messageId}/reactions")]
        public async Task<IActionResult> ToggleReaction(Guid messageId, [FromBody] ReactionRequestDto model)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var (success, chatId) = await _chatService.ToggleReactionAsync(messageId, userId, model.Reaction);
            if (!success)
            {
                return NotFound("Message not found or you are not part of the chat.");
            }

            if (chatId.HasValue)
            {
                var reactionUpdate = new { messageId, userId = userId.ToString(), reaction = model.Reaction };
                await _hubContext.Clients.Group(chatId.Value.ToString()).SendAsync("ReactionToggled", reactionUpdate);
            }

            return Ok();
        }

        [HttpPost("{messageId}/vote")]
        public async Task<IActionResult> VoteOnPoll(Guid messageId, [FromBody] VoteRequestDto voteDto)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized("User not found");
            }

            var (success, updatedPollData, chatId) = await _chatService.VoteOnPollAsync(messageId, userId, voteDto.OptionIndex);

            if (!success)
            {
                return BadRequest(new { message = "Failed to vote on poll." });
            }

            // Notify other clients in the group via SignalR
            if (chatId.HasValue)
            {
                // You might want to create a specific payload for poll updates
                await _hubContext.Clients.Group(chatId.Value.ToString()).SendAsync("PollUpdated", new { messageId, pollData = updatedPollData });
            }

            return Ok();
        }

        [HttpPost("{messageId}/poll/options")]
        public async Task<IActionResult> AddPollOption(Guid messageId, [FromBody] AddPollOptionDto addOptionDto)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized("User not found");
            }

            var (success, updatedPollData, chatId) = await _chatService.AddPollOptionAsync(messageId, userId, addOptionDto.OptionText);

            if (!success) return BadRequest(new { message = "Failed to add poll option." });

            if (chatId.HasValue)
            {
                // Gửi thông báo real-time đến các client khác trong group
                await _hubContext.Clients.Group(chatId.Value.ToString()).SendAsync("PollUpdated", new { messageId, pollData = updatedPollData });
            }

            return Ok();
        }
    }
}