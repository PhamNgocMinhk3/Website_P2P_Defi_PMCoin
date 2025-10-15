namespace TradeFinanceBackend.Models.DTOs
{
    /// <summary>
    /// DTO hợp nhất đại diện cho một cuộc trò chuyện (conversation) trong danh sách chat.
    /// </summary>
    public class ChatDto
    {
        public Guid Id { get; set; }
        public string? Name { get; set; }
        public string? Avatar { get; set; }
        public Guid? OtherUserId { get; set; }
        public bool IsBlockedByYou { get; set; }
        public bool IsBlockedByOther { get; set; }
        public bool IsOnline { get; set; }
        public bool ShowOnlineStatus { get; set; }
        public bool IsGroup { get; set; }
        public DateTime CreatedAt { get; set; }
        public MessageDto? LastMessage { get; set; }
        public int UnreadCount { get; set; }
        public Guid? OwnerId { get; set; }
        public bool RequireApproval { get; set; }
        public bool OnlyAdminsCanSend { get; set; }
        public bool AllowMemberInvite { get; set; }

    }
}