using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TradeFinanceBackend.Models.DTOs
{
    // Represents a user in a chat context
    public class ChatUserDto
    {
        public string Id { get; set; } = string.Empty;
        public string? Username { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Avatar { get; set; }
        public bool IsOnline { get; set; }

        // Default constructor for deserialization
        public ChatUserDto() { }

        // Constructor to create DTO from User model
        public ChatUserDto(User user)
        {
            if (user != null)
            {
                Id = user.Id.ToString();
                Username = user.Username;
                FirstName = user.FirstName;
                LastName = user.LastName;
                Avatar = user.UserProfile?.Avatar;
                IsOnline = user.IsOnline;
            }
        }
    }

    // Represents appointment data within a message
    public class AppointmentData
    {
        public string? Title { get; set; }
        public string? Description { get; set; }
        public DateTime DateTime { get; set; }
        public ChatUserDto? CreatedBy { get; set; }
        public List<ChatUserDto> Participants { get; set; } = new List<ChatUserDto>();
        public List<string> DeclinedBy { get; set; } = new List<string>();
    }

    // Represents poll data within a message
    public class PollData
    {
        [JsonPropertyName("question")]
        public string? Question { get; set; }
        [JsonPropertyName("options")]
        public List<PollOption> Options { get; set; } = new List<PollOption>();
    }

    public class PollOption
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }
        [JsonPropertyName("voters")]
        public List<string> Voters { get; set; } = new List<string>();

        // Automatically calculate the number of votes based on the Voters list.
        [JsonPropertyName("votes")]
        public int Votes => Voters.Count;
    }

    // DTO for creating a new message
    public class CreateMessageDto
    {
        public Guid ChatId { get; set; }
        public object Content { get; set; } = string.Empty;
        public string Type { get; set; } = "text";
    }

    // DTO for creating a one-on-one chat
    public class CreateOneOnOneChatDto
    {
        public Guid TargetUserId { get; set; }
    }

    // DTO for toggling a reaction
    public class ReactionRequestDto
    {
        public required string Reaction { get; set; }
    }

    // DTO for voting on a poll
    public class VoteRequestDto
    {
        public int OptionIndex { get; set; }
        public PollData? PollData { get; set; }
    }

    // DTO for creating a new group chat
    public class CreateGroupDto
    {
        [System.ComponentModel.DataAnnotations.Required]
        [System.ComponentModel.DataAnnotations.StringLength(100, MinimumLength = 3)]
        public string Name { get; set; } = string.Empty;
        public List<Guid> MemberIds { get; set; } = new List<Guid>();
    }

    // DTO for representing a single message
    public class MessageDto
    {
        public Guid Id { get; set; }
        public Guid ChatId { get; set; }
        public Guid SenderId { get; set; }
        public string? SenderUsername { get; set; }
        public string? SenderAvatar { get; set; }
        public bool SenderActive { get; set; }
        public string? Type { get; set; }
        public string? Content { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? Attachments { get; set; }
        public bool IsOnline { get; set; }
        public bool ShowOnlineStatus { get; set; }
        public PollData? PollData { get; set; }
        public AppointmentData? AppointmentData { get; set; }
        public Dictionary<string, List<string>>? Reactions { get; set; }
    }
}

// DTO for representing a group member
public class GroupMemberDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Avatar { get; set; }
    public string Role { get; set; } = string.Empty; // "owner", "admin", "member"
    public string? Nickname { get; set; }
    public DateTime JoinedAt { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }
    public bool ShowOnlineStatus { get; set; }
}