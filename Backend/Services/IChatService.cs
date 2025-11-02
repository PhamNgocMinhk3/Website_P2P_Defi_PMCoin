using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface IChatService
    {
        Task<IEnumerable<ChatDto>> GetUserConversationsAsync(Guid userId);
        Task<IEnumerable<MessageDto>> GetMessagesAsync(Guid conversationId, Guid userId, int pageNumber, int pageSize);
        Task<ChatDto> CreateOrGetOneOnOneChatAsync(Guid currentUserId, Guid targetUserId);
        Task<ChatDto> CreateGroupAsync(string name, List<Guid> memberIds, Guid creatorId);
        Task<MessageDto> SendMessageAsync(Guid chatId, Guid senderId, object content, string type);
        Task<(bool Success, Guid? ChatId)> DeleteMessageAsync(Guid messageId, Guid userId);
        Task<(bool Success, Guid? ChatId)> ToggleReactionAsync(Guid messageId, Guid userId, string reaction);
        Task<(bool Success, object? UpdatedPollData, Guid? ChatId)> VoteOnPollAsync(Guid messageId, Guid userId, int optionIndex);
        Task<(bool Success, AppointmentData? UpdatedAppointmentData, Guid? ChatId)> AcceptAppointmentAsync(Guid messageId, Guid userId);
        Task MarkMessagesAsReadAsync(Guid conversationId, Guid userId);
        Task<(bool Success, AppointmentData? UpdatedAppointmentData, Guid? ChatId)> DeclineAppointmentAsync(Guid messageId, Guid userId);
        Task<bool> CanSendMessageAsync(Guid chatId, Guid senderId);
        Task<List<string>> GetValidRecipientsAsync(Guid chatId, Guid senderId);
        Task<(bool Success, object? UpdatedPollData, Guid? ChatId)> AddPollOptionAsync(Guid messageId, Guid userId, string newOptionText);
        Task<(bool Success, List<string> ParticipantIds)> DeleteConversationAsync(string conversationId, string userId);
        Task<IEnumerable<GroupMemberDto>> GetGroupMembersAsync(Guid conversationId, Guid userId);
        Task<(bool Success, string Message)> UpdateMemberRoleAsync(Guid conversationId, Guid memberId, string role, Guid currentUserId);
        Task<(bool Success, string Message)> KickMemberAsync(Guid conversationId, Guid memberId, Guid currentUserId);
        Task<(bool Success, string Message)> TransferOwnershipAsync(Guid conversationId, Guid newOwnerId, Guid currentUserId);
        Task<(bool Success, string Message, bool WasAddedToPending)> AddMembersToGroupAsync(Guid conversationId, List<Guid> memberIds, Guid currentUserId);
        Task<(bool Success, string Message, List<string> MemberIds)> LeaveGroupAsync(Guid conversationId, Guid userId);
        Task<(bool Success, IEnumerable<GroupMemberDto> Members, string Message)> GetPendingMembersAsync(Guid conversationId, Guid userId);
        Task<(bool Success, string Message, ChatDto? NewMember, List<string> AllMemberIds)> ApprovePendingMemberAsync(Guid conversationId, Guid memberId, Guid adminId);
        Task<(bool Success, string Message)> RejectPendingMemberAsync(Guid conversationId, Guid memberId, Guid adminId);
        Task<(bool Success, string Message)> UpdateGroupSettingsAsync(Guid conversationId, Guid currentUserId, GroupSettingsDto payload);
        Task<(bool Success, string Message, List<string> MemberIds)> DisbandGroupAsync(Guid conversationId, Guid currentUserId);
    }
}