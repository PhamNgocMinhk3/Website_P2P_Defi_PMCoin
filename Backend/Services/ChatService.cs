using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Hubs;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;
using System.Text.Json;

namespace TradeFinanceBackend.Services
{
    public class ChatService : IChatService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly IHubContext<ChatHub, IChatClient> _chatHubContext;

        public ChatService(TradeFinanceDbContext context, IHubContext<ChatHub, IChatClient> chatHubContext)
        {
            _context = context;
            _chatHubContext = chatHubContext;
        }

        public async Task<IEnumerable<ChatDto>> GetUserConversationsAsync(Guid userId)
        {
            var conversations = await _context.Chats
                .AsNoTracking()
                .Include(c => c.Participants).ThenInclude(p => p.User).ThenInclude(u => u.UserProfile)
                .Include(c => c.Messages.OrderByDescending(m => m.CreatedAt).Take(1)).ThenInclude(m => m.Sender)
                .Where(c => c.Participants.Any(p => p.UserId == userId))
                .AsSplitQuery() // Tối ưu để tránh lỗi "Cartesian explosion"
                .Select(c => new ChatDto
                {
                    Id = c.Id,
                    Name = c.IsGroup ? c.Name : c.Participants.Where(p => p.UserId != userId).Select(p => (p.User != null ? (p.User.LastName + " " + p.User.FirstName).Trim() : "Unknown User")).FirstOrDefault(),
                    Avatar = c.Avatar ?? (c.IsGroup ? (c.Name != null && c.Name.Length > 0 ? $"https://ui-avatars.com/api/?name={Uri.EscapeDataString(c.Name.Substring(0, 1))}&background=random&color=fff&size=128" : null) : c.Participants.Where(p => p.UserId != userId).Select(p => p.User!.UserProfile != null ? p.User.UserProfile.Avatar : null).FirstOrDefault()),
                    OtherUserId = c.IsGroup ? (Guid?)null : c.Participants.Where(p => p.UserId != userId).Select(p => p.UserId).FirstOrDefault(),
                    IsBlockedByYou = !c.IsGroup && _context.BlockedUsers.Any(b => b.BlockerId == userId && c.Participants.Any(p => p.UserId == b.BlockedId && p.UserId != userId)),
                    IsBlockedByOther = !c.IsGroup && _context.BlockedUsers.Any(b => b.BlockedId == userId && c.Participants.Any(p => p.UserId == b.BlockerId && p.UserId != userId)),
                    IsGroup = c.IsGroup,
                    LastMessage = c.Messages.OrderByDescending(m => m.CreatedAt).Select(m => new MessageDto
                    {
                        Id = m.Id,
                        ChatId = m.ChatId,
                        SenderId = m.SenderId,
                        SenderUsername = m.Sender!.Username,
                        Type = m.Type,
                        Content = m.Type == MessageTypes.Text ? m.Content : $"[{m.Type.ToUpper()}]",
                        CreatedAt = m.CreatedAt
                    }).FirstOrDefault(),
                    // FIX: Replaced the untranslatable dictionary lookup with a translatable subquery.
                    UnreadCount = c.Messages.Count(m => m.CreatedAt > (_context.MessageReads
                        .Where(mr => mr.ChatId == c.Id && mr.UserId == userId)
                        .Select(mr => (DateTime?)mr.ReadAt)
                        .FirstOrDefault() ?? DateTime.MinValue)),
                    // FIX: Calculate IsOnline based on both the actual online status AND the user's privacy setting.
                    IsOnline = !c.IsGroup && c.Participants.Where(p => p.UserId != userId).Select(p =>
                        p.User!.IsOnline && (_context.UserSettings.Where(s => s.UserId == p.UserId).Select(s => (bool?)s.ShowOnlineStatus).FirstOrDefault() ?? true)
                    ).FirstOrDefault(),
                    ShowOnlineStatus = !c.IsGroup && c.Participants.Where(p => p.UserId != userId).Select(p => _context.UserSettings.Where(s => s.UserId == p.UserId).Select(s => (bool?)s.ShowOnlineStatus).FirstOrDefault() ?? true).FirstOrDefault(),
                    RequireApproval = c.RequireApproval,
                    OnlyAdminsCanSend = c.OnlyAdminsCanSend,
                    AllowMemberInvite = c.AllowMemberInvite,
                    CreatedAt = c.CreatedAt

                })
                .ToListAsync();

            // The sorting is done in memory after fetching, as it depends on the LastMessage which is complex to sort in the DB.
            return conversations.OrderByDescending(c => c.LastMessage?.CreatedAt ?? c.CreatedAt);
        }

        public async Task<IEnumerable<MessageDto>> GetMessagesAsync(Guid conversationId, Guid userId, int pageNumber, int pageSize)
        {
            var messages = await _context.Messages
                .Where(m => m.ChatId == conversationId)
                .OrderByDescending(m => m.CreatedAt)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .Include(m => m.Sender)
                    .ThenInclude(s => s.UserProfile) // Include UserProfile for Sender
                .Include(m => m.Reactions) // Tải các reactions liên quan
                .ToListAsync(); // Execute the query here

            // Bây giờ xử lý tin nhắn trong bộ nhớ
            var messageDtos = messages.Select(m =>
            {
                var dto = new MessageDto
                {
                    Id = m.Id,
                    ChatId = m.ChatId,
                    SenderId = m.SenderId,
                    SenderUsername = m.Sender?.Username ?? "Unknown",
                    Type = m.Type,
                    CreatedAt = m.CreatedAt,
                    Attachments = m.Attachments,
                    PollData = m.PollData,
                    AppointmentData = m.AppointmentData,
                    SenderAvatar = m.Sender?.UserProfile?.Avatar,
                    Reactions = m.Reactions
                                    .GroupBy(r => r.Reaction)
                                    .ToDictionary(g => g.Key, g => g.Select(r => r.UserId.ToString()).ToList()),
                    SenderActive = m.Sender?.IsOnline ?? false,
                    Content = m.Content ?? ""
                };
                return dto;
            }).ToList();

            return messageDtos.OrderBy(m => m.CreatedAt); // Return in ascending order for chat display
        }

        public async Task<ChatDto> CreateOrGetOneOnOneChatAsync(Guid currentUserId, Guid targetUserId)
        {
            // Check if a one-on-one chat already exists between these two users
            var existingChat = await _context.Chats
                .Where(c => !c.IsGroup &&
                            c.Participants.Any(p => p.UserId == currentUserId) &&
                            c.Participants.Any(p => p.UserId == targetUserId))
                .Include(c => c.Participants) // Include participants
                    .ThenInclude(p => p.User) // Include user for each participant
                        .ThenInclude(u => u.UserProfile) // Include user profile for avatar
                .FirstOrDefaultAsync();

            if (existingChat != null)
            {
                var otherParticipant = existingChat.Participants.FirstOrDefault(p => p.UserId != currentUserId);
                var otherUser = otherParticipant?.User;

                return new ChatDto
                {
                    Id = existingChat.Id,
                    Name = (otherUser != null ? $"{otherUser.LastName} {otherUser.FirstName}".Trim() : "Unknown User"),
                    Avatar = otherUser?.UserProfile?.Avatar,
                    IsGroup = existingChat.IsGroup,
                    OwnerId = existingChat.OwnerId,
                    CreatedAt = existingChat.CreatedAt,
                    RequireApproval = existingChat.RequireApproval,
                    OnlyAdminsCanSend = existingChat.OnlyAdminsCanSend,
                    AllowMemberInvite = existingChat.AllowMemberInvite
                };
            }

            // Create a new one-on-one chat
            var newChat = new Chat
            {
                Id = Guid.NewGuid(),
                IsGroup = false,
                CreatedAt = DateTime.UtcNow,
                OwnerId = currentUserId // The creator is the owner
            };

            _context.Chats.Add(newChat);

            _context.ChatParticipants.Add(new ChatParticipant { ChatId = newChat.Id, UserId = currentUserId, Role = ChatRole.Member });
            _context.ChatParticipants.Add(new ChatParticipant { ChatId = newChat.Id, UserId = targetUserId, Role = ChatRole.Member });

            await _context.SaveChangesAsync();

            // Fetch the target user's details to create the DTO
            var targetUser = await _context.Users
                .Include(u => u.UserProfile)
                .FirstOrDefaultAsync(u => u.Id == targetUserId);

            // Return the newly created chat as a DTO
            return new ChatDto
            {
                Id = newChat.Id,
                Name = (targetUser != null ? $"{targetUser.LastName} {targetUser.FirstName}".Trim() : "Unknown User"),
                Avatar = targetUser?.UserProfile?.Avatar,
                IsGroup = newChat.IsGroup,
                OwnerId = newChat.OwnerId,
                CreatedAt = newChat.CreatedAt,
                RequireApproval = newChat.RequireApproval,
                OnlyAdminsCanSend = newChat.OnlyAdminsCanSend,
                AllowMemberInvite = newChat.AllowMemberInvite
            };
        }

        public async Task<ChatDto> CreateGroupAsync(string name, List<Guid> memberIds, Guid creatorId)
        {
            // --- FIX LỖI VAI TRÒ & REAL-TIME ---

            var newChat = new Chat
            {
                Id = Guid.NewGuid(),
                Name = name,
                IsGroup = true,
                OwnerId = creatorId,
                CreatedAt = DateTime.UtcNow,
                // Default settings for a new group
                AllowMemberInvite = true,
                OnlyAdminsCanSend = false,
                RequireApproval = false,
                Avatar = $"https://ui-avatars.com/api/?name={Uri.EscapeDataString(name.Substring(0, 1))}&background=random&color=fff&size=128"
            };

            _context.Chats.Add(newChat);

            var participants = new List<ChatParticipant>();

            // Add the creator as the owner
            participants.Add(new ChatParticipant { ChatId = newChat.Id, UserId = creatorId, Role = ChatRole.Owner });

            // Add other members
            foreach (var memberId in memberIds)
            {
                if (memberId != creatorId) // Ensure creator is not added twice
                {
                    participants.Add(new ChatParticipant { ChatId = newChat.Id, UserId = memberId, Role = ChatRole.Member });
                }
            }

            _context.ChatParticipants.AddRange(participants);
            await _context.SaveChangesAsync();

            // --- FIX REAL-TIME: Gửi sự kiện đến tất cả thành viên ---
            // 1. Chuẩn bị DTO để gửi cho client
            var conversationDto = new ChatDto
            {
                Id = newChat.Id,
                Name = newChat.Name,
                Avatar = newChat.Avatar,
                IsGroup = true,
                OwnerId = newChat.OwnerId,
                CreatedAt = newChat.CreatedAt,
                LastMessage = null, // No messages yet
                UnreadCount = 1 // New group, so it's unread for members
            };

            // 2. Lặp qua tất cả thành viên và gửi sự kiện "AddedToGroup"
            // Chuyển đổi Guid thành string để dùng với SignalR
            var participantUserIds = participants.Select(p => p.UserId.ToString()).ToList();

            // Gửi sự kiện đến tất cả các client của những user này
            await _chatHubContext.Clients.Users(participantUserIds).AddedToGroup(conversationDto);

            // Log để debug
            System.Diagnostics.Debug.WriteLine($"Sent 'AddedToGroup' event for new group '{newChat.Name}' to {participants.Count} members.");

            // 3. Trả về DTO cho người tạo nhóm. Người tạo nhóm không có tin nhắn chưa đọc.
            // Các thành viên khác đã nhận DTO với UnreadCount = 1 qua SignalR.
            conversationDto.UnreadCount = 0;
            return conversationDto;
        }

        public async Task MarkMessagesAsReadAsync(Guid conversationId, Guid userId)
        {
            var lastMessage = await _context.Messages
                .Where(m => m.ChatId == conversationId)
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefaultAsync();

            if (lastMessage == null)
            {
                return; // No messages in this conversation
            }

            var messageReadEntry = await _context.MessageReads
                .FirstOrDefaultAsync(mr => mr.ChatId == conversationId && mr.UserId == userId);

            if (messageReadEntry == null)
            {
                // Create a new entry if it doesn't exist
                _context.MessageReads.Add(new MessageRead
                {
                    Id = Guid.NewGuid(),
                    ChatId = conversationId,
                    UserId = userId,
                    MessageId = lastMessage.Id,
                    ReadAt = DateTime.UtcNow
                });
            }
            else
            {
                // Update existing entry
                messageReadEntry.MessageId = lastMessage.Id;
                messageReadEntry.ReadAt = DateTime.UtcNow;
                _context.MessageReads.Update(messageReadEntry);
            }

            await _context.SaveChangesAsync();
        }

        public async Task IncrementUnreadCountAsync(Guid chatId, Guid userId)
        {
            var messageReadEntry = await _context.MessageReads
                .FirstOrDefaultAsync(mr => mr.ChatId == chatId && mr.UserId == userId);

            if (messageReadEntry == null)
            {
                _context.MessageReads.Add(new MessageRead
                {
                    Id = Guid.NewGuid(),
                    ChatId = chatId,
                    UserId = userId,
                    MessageId = Guid.Empty, // No specific message read yet
                    ReadAt = DateTime.MinValue // Mark as unread
                });
            }
            else
            {
                // If the user has read messages before, mark it as unread again
                messageReadEntry.ReadAt = DateTime.MinValue;
                _context.MessageReads.Update(messageReadEntry);
            }
            await _context.SaveChangesAsync();
        }

        public async Task<MessageDto> SendMessageAsync(Guid chatId, Guid senderId, object content, string type)
        {
            var message = new Message
            {
                Id = Guid.NewGuid(),
                ChatId = chatId,
                SenderId = senderId,
                Type = type,
                CreatedAt = DateTime.UtcNow
            };

            string contentAsString = content.ToString() ?? "";

            // Handle complex message types by serializing data into the correct properties
            switch (type)
            {
                case MessageTypes.Image:
                case MessageTypes.File:
                case MessageTypes.Audio:
                case MessageTypes.Video:
                case MessageTypes.Gif:
                    // For attachment types, the JSON content goes into the 'Attachments' column.
                    message.Attachments = contentAsString;
                    // Set a user-friendly content summary.
                    message.Content = $"[{type.ToUpper()}]"; // e.g., [IMAGE], [GIF]
                    break;
                case MessageTypes.Poll:
                    // Deserialize the JSON string from 'content' into the PollData object.
                    // EF Core will then handle serializing this object into the 'jsonb' column.
                    message.PollData = JsonSerializer.Deserialize<PollData>(contentAsString, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });
                    // Set the main 'Content' field to the poll's question for summary/display purposes.
                    message.Content = message.PollData?.Question ?? "[Poll]";
                    break;
                case MessageTypes.Appointment:
                    // Same logic for appointments.
                    message.AppointmentData = JsonSerializer.Deserialize<AppointmentData>(contentAsString, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });
                    message.Content = message.AppointmentData?.Title ?? "[Appointment]";

                    // Ensure CreatedBy and Participants are set correctly
                    var senderForAppointment = await _context.Users
                        .AsNoTracking()
                        .Include(u => u.UserProfile)
                        .FirstOrDefaultAsync(u => u.Id == senderId);

                    if (senderForAppointment != null && message.AppointmentData != null)
                    {
                        message.AppointmentData.CreatedBy = new ChatUserDto(senderForAppointment);
                        message.AppointmentData.Participants = new List<ChatUserDto>();
                    }

                    break;
                default: // Handles 'text' and any other simple types
                    message.Content = contentAsString;
                    break;
            }

            _context.Messages.Add(message);
            await _context.SaveChangesAsync();

            // Reload sender info to return a complete DTO
            var sender = await _context.Users // This is the user model
                .AsNoTracking() // Read-only query is more efficient
                .Include(u => u.UserProfile)
                .FirstOrDefaultAsync(u => u.Id == senderId);

            // Get the participant info to check for a nickname
            var participant = await _context.ChatParticipants
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.ChatId == chatId && p.UserId == senderId);

            var senderDisplayName = !string.IsNullOrWhiteSpace(participant?.Nickname) ? participant.Nickname : (sender != null ? $"{sender.FirstName} {sender.LastName}".Trim() : "Unknown");

            return new MessageDto
            {
                Id = message.Id,
                ChatId = message.ChatId,
                SenderId = message.SenderId,
                Content = message.Content ?? "", // Ensure Content is not null
                Type = message.Type,
                CreatedAt = message.CreatedAt,
                SenderUsername = senderDisplayName,
                // FIX: Return the full data object for real-time processing on the client.
                // The client will parse Attachments string if needed.
                PollData = message.PollData,
                AppointmentData = message.AppointmentData,
                Attachments = message.Attachments,
                SenderAvatar = sender?.UserProfile?.Avatar,
                SenderActive = sender?.IsOnline ?? false,
                Reactions = new Dictionary<string, List<string>>() // Reactions are empty for a new message
            };
        }

        public async Task<(bool Success, Guid? ChatId)> DeleteMessageAsync(Guid messageId, Guid userId)
        {
            var message = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null)
            {
                return (false, null); // Message not found
            }

            // Business rule: Only the sender can delete their message.
            if (message.SenderId != userId)
            {
                return (false, null); // User is not authorized to delete this message
            }

            _context.Messages.Remove(message);
            await _context.SaveChangesAsync();

            return (true, message.ChatId);
        }

        public async Task<(bool Success, Guid? ChatId)> ToggleReactionAsync(Guid messageId, Guid userId, string reaction)
        {
            var message = await _context.Messages.FindAsync(messageId);
            if (message == null)
            {
                return (false, null); // Message not found
            }

            var existingReaction = await _context.MessageReactions
                .FirstOrDefaultAsync(r => r.MessageId == messageId && r.UserId == userId);

            if (existingReaction != null)
            {
                // User has reacted before. If it's the same reaction, remove it. Otherwise, update it.
                if (existingReaction.Reaction == reaction)
                {
                    _context.MessageReactions.Remove(existingReaction);
                }
                else
                {
                    existingReaction.Reaction = reaction;
                    _context.MessageReactions.Update(existingReaction);
                }
            }
            else
            {
                // New reaction
                _context.MessageReactions.Add(new MessageReaction { MessageId = messageId, UserId = userId, Reaction = reaction });
            }

            await _context.SaveChangesAsync();
            return (true, message.ChatId);
        }

        public async Task<(bool Success, object? UpdatedPollData, Guid? ChatId)> VoteOnPollAsync(Guid messageId, Guid userId, int optionIndex)
        {
            var message = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null || message.Type != MessageTypes.Poll)
            {
                return (false, null, null);
            }

            var pollData = message.PollData;
            if (pollData == null || optionIndex < 0 || optionIndex >= pollData.Options.Count)
            {
                return (false, null, message.ChatId); // Invalid option index
            }

            var optionToUpdate = pollData.Options[optionIndex];

            // Allow multiple votes: Toggle vote for the specific option
            var userIdStr = userId.ToString();
            if (optionToUpdate.Voters.Contains(userIdStr))
            {
                // User has voted for this option, so remove the vote (toggle off)
                optionToUpdate.Voters.Remove(userIdStr);
            }
            else
            {
                // User has not voted for this option, so add the vote (toggle on)
                optionToUpdate.Voters.Add(userIdStr);
            }

            // The old logic that removed votes from other options is removed.
            // This now allows a user to be in the 'voters' list of multiple options.
            // Example old logic (REMOVED):
            // foreach (var option in pollData.Options)
            // {
            //     if (option != optionToUpdate) {
            //         option.Voters.Remove(userId.ToString());

            // Update the message's PollData
            // Explicitly mark the PollData property as modified so EF Core knows to update the JSONB column.
            // This is more efficient than marking the entire entity for update.
            _context.Entry(message).Property(m => m.PollData).IsModified = true;
            await _context.SaveChangesAsync();

            // Return the updated data for broadcasting
            return (true, message.PollData, message.ChatId);
        }

        public async Task<(bool Success, AppointmentData? UpdatedAppointmentData, Guid? ChatId)> AcceptAppointmentAsync(Guid messageId, Guid userId)
        {
            var message = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId);
            if (message == null || message.Type != MessageTypes.Appointment || message.AppointmentData == null)
            {
                return (false, null, null);
            }

            var appointmentData = message.AppointmentData;
            if (appointmentData == null) return (false, null, message.ChatId);

            // Prevent creator from accepting their own appointment or duplicate acceptances
            if (appointmentData.CreatedBy?.Id == userId.ToString() || appointmentData.Participants.Any(p => p.Id == userId.ToString()) || (appointmentData.DeclinedBy?.Contains(userId.ToString()) ?? false))
            {
                return (false, null, message.ChatId);
            }

            var user = await _context.Users.Include(u => u.UserProfile).FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                return (false, null, message.ChatId);
            }

            // Add user to participants
            appointmentData.Participants.Add(new ChatUserDto(user));

            // Mark for update
            _context.Entry(message).Property(m => m.AppointmentData).IsModified = true;
            await _context.SaveChangesAsync();

            return (true, appointmentData, message.ChatId);
        }

        public async Task<(bool Success, AppointmentData? UpdatedAppointmentData, Guid? ChatId)> DeclineAppointmentAsync(Guid messageId, Guid userId)
        {
            var message = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId);
            if (message == null || message.Type != MessageTypes.Appointment || message.AppointmentData == null)
            {
                return (false, null, null);
            }

            var appointmentData = message.AppointmentData;

            // Creator cannot decline/leave, they must cancel (delete) the message.
            if (appointmentData.CreatedBy?.Id == userId.ToString())
            {
                return (false, null, message.ChatId);
            }

            var participant = appointmentData.Participants.FirstOrDefault(p => p.Id == userId.ToString());
            if (participant != null)
            {
                // If user had accepted, remove them from participants list
                appointmentData.Participants.Remove(participant);
            }

            // Add user to a new 'declined' list to hide buttons for them permanently.
            appointmentData.DeclinedBy ??= new List<string>();

            if (!appointmentData.DeclinedBy.Contains(userId.ToString()))
            {
                appointmentData.DeclinedBy.Add(userId.ToString());
            }
            _context.Entry(message).Property(m => m.AppointmentData).IsModified = true;
            await _context.SaveChangesAsync();

            return (true, appointmentData, message.ChatId);
        }

        public async Task<bool> CanSendMessageAsync(Guid chatId, Guid senderId)
        {
            var chat = await _context.Chats
                .Include(c => c.Participants)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == chatId);

            if (chat == null || chat.IsGroup)
            {
                // Blocking logic currently only applies to 1-on-1 chats for sending.
                // For group chats, we allow sending but will filter delivery.
                return true;
            }

            var otherParticipantId = chat.Participants.FirstOrDefault(p => p.UserId != senderId)?.UserId;
            if (!otherParticipantId.HasValue)
            {
                return false; // Chat with no other participant
            }

            // Check if the recipient (otherParticipantId) has blocked the sender.
            var isBlocked = await _context.BlockedUsers
                .AnyAsync(b => b.BlockerId == otherParticipantId.Value && b.BlockedId == senderId);

            return !isBlocked;
        }

        public async Task<List<string>> GetValidRecipientsAsync(Guid chatId, Guid senderId)
        {
            var chat = await _context.Chats
                .Include(c => c.Participants)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == chatId);

            if (chat == null)
            {
                return new List<string>();
            }

            // Get IDs of users who have blocked the sender
            var usersWhoBlockedSender = await _context.BlockedUsers
                .Where(b => b.BlockedId == senderId)
                .Select(b => b.BlockerId)
                .ToListAsync();

            // Determine the final list of recipients (everyone except those who blocked the sender)
            // The sender always receives their own message for UI updates.
            return chat.Participants
                .Where(p => p.UserId == senderId || !usersWhoBlockedSender.Contains(p.UserId))
                .Select(p => p.UserId.ToString()).ToList();
        }

        public async Task<(bool Success, object? UpdatedPollData, Guid? ChatId)> AddPollOptionAsync(Guid messageId, Guid userId, string newOptionText)
        {
            var message = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null || message.Type != MessageTypes.Poll || message.PollData == null)
            {
                return (false, null, null);
            }

            var pollData = message.PollData;

            // Check if option already exists (case-insensitive)
            if (pollData.Options.Any(o => o.Text.Equals(newOptionText, StringComparison.OrdinalIgnoreCase)))
            {
                return (false, null, message.ChatId);
            }

            pollData.Options.Add(new PollOption
            {
                Text = newOptionText,
                Voters = new List<string>()
            });

            _context.Entry(message).Property(m => m.PollData).IsModified = true;
            await _context.SaveChangesAsync();

            return (true, pollData, message.ChatId);
        }

        public async Task<(bool Success, List<string> ParticipantIds)> DeleteConversationAsync(string conversationId, string userId)
        {
            if (!Guid.TryParse(conversationId, out var chatGuid) || !Guid.TryParse(userId, out var userGuid))
            {
                return (false, new List<string>());
            }

            var chat = await _context.Chats
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == chatGuid);

            if (chat == null)
            {
                return (false, new List<string>()); // Not found
            }

            var participant = chat.Participants.FirstOrDefault(p => p.UserId == userGuid);
            if (participant == null)
            {
                // User is not part of this conversation.
                return (false, new List<string>());
            }

            // Business Rule: For group chats, only the owner can delete it.
            // For 1-on-1 chats, either participant can "delete" it (which hides it for them).
            if (chat.IsGroup && chat.OwnerId != userGuid)
            {
                return (false, new List<string>()); // User is not the owner of the group chat.
            }

            var participantIds = chat.Participants.Select(p => p.UserId.ToString()).ToList();

            // This is a hard delete. It will remove the conversation for ALL participants.
            // Consider a soft-delete or a "leave" mechanism if this is not the desired behavior.
            _context.Chats.Remove(chat);
            await _context.SaveChangesAsync();
            return (true, participantIds);
        }

        public async Task<IEnumerable<GroupMemberDto>> GetGroupMembersAsync(Guid conversationId, Guid userId)
        {
            var chat = await _context.Chats
                .Include(c => c.Participants)
                    .ThenInclude(p => p.User)
                        .ThenInclude(u => u.UserProfile)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == conversationId && c.IsGroup);

            if (chat == null || !chat.Participants.Any(p => p.UserId == userId))
            {
                // Or throw an exception for unauthorized access
                return new List<GroupMemberDto>();
            }

            // FIX: Only return members who are not pending.
            // Pending members should only be fetched via GetPendingMembersAsync.
            return chat.Participants.Where(p => p.User != null && p.Role != ChatRole.Pending).Select(p => new GroupMemberDto
            {
                Id = p.UserId.ToString(),
                Name = (p.User!.LastName + " " + p.User!.FirstName).Trim(),
                Avatar = p.User!.UserProfile?.Avatar,
                Role = p.Role.ToString().ToLower(), // owner, admin, member
                Nickname = p.Nickname,
                JoinedAt = p.JoinedAt,
                // FIX: Calculate IsOnline based on both the actual online status AND the user's privacy setting.
                IsOnline = p.User!.IsOnline && (_context.UserSettings.Where(s => s.UserId == p.UserId).Select(s => (bool?)s.ShowOnlineStatus).FirstOrDefault() ?? true),
                LastSeen = p.User!.LastSeen,
                // Also pass the privacy setting to the client so it can correctly handle real-time presence updates.
                ShowOnlineStatus = _context.UserSettings.Where(s => s.UserId == p.UserId).Select(s => (bool?)s.ShowOnlineStatus).FirstOrDefault() ?? true

            }).OrderBy(m => m.Role == "owner" ? 0 : m.Role == "admin" ? 1 : 2)
              .ThenBy(m => m.Name)
              .ToList();
        }

        public async Task<(bool Success, string Message)> UpdateMemberRoleAsync(Guid conversationId, Guid memberId, string role, Guid currentUserId)
        {
            var chat = await _context.Chats
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.");

            var currentUserParticipant = chat.Participants.FirstOrDefault(p => p.UserId == currentUserId); // No user info needed here
            if (currentUserParticipant?.Role != ChatRole.Owner)
            {
                return (false, "Only the group owner can change roles.");
            }

            var targetParticipant = chat.Participants.FirstOrDefault(p => p.UserId == memberId);
            if (targetParticipant == null) return (false, "Member not found.");

            if (targetParticipant.UserId == currentUserId) return (false, "You cannot change your own role.");

            var newRole = role.ToLower() switch
            {
                "admin" => ChatRole.Admin,
                "member" => ChatRole.Member,
                _ => (ChatRole?)null
            };

            if (newRole == null) return (false, "Invalid role specified.");

            targetParticipant.Role = newRole.Value;
            await _context.SaveChangesAsync();

            return (true, "Member role updated successfully.");
        }

        public async Task<(bool Success, string Message)> KickMemberAsync(Guid conversationId, Guid memberId, Guid currentUserId)
        {
            var chat = await _context.Chats
                .Include(c => c.Participants).ThenInclude(p => p.User) // Include User to get name
                .FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.");

            var currentUserParticipant = chat.Participants.FirstOrDefault(p => p.UserId == currentUserId);
            var targetParticipant = chat.Participants.FirstOrDefault(p => p.UserId == memberId);

            if (targetParticipant == null) return (false, "Member not found.");
            if (currentUserParticipant == null) return (false, "You are not a member of this group.");

            // Permission check: Owner can kick anyone (except themselves). Admin can kick members.
            bool canKick = (currentUserParticipant.Role == ChatRole.Owner && targetParticipant.Role != ChatRole.Owner) ||
                           (currentUserParticipant.Role == ChatRole.Admin && targetParticipant.Role == ChatRole.Member);

            if (!canKick)
            {
                return (false, "You do not have permission to kick this member.");
            }

            _context.ChatParticipants.Remove(targetParticipant);
            await _context.SaveChangesAsync();

            return (true, "Member kicked successfully.");
        }

        public async Task<(bool Success, string Message)> TransferOwnershipAsync(Guid conversationId, Guid newOwnerId, Guid currentUserId)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.");

            var currentUserParticipant = chat.Participants.FirstOrDefault(p => p.UserId == currentUserId);
            if (currentUserParticipant?.Role != ChatRole.Owner)
            {
                return (false, "Only the group owner can transfer ownership.");
            }

            var newOwnerParticipant = chat.Participants.FirstOrDefault(p => p.UserId == newOwnerId);
            if (newOwnerParticipant == null) return (false, "Target user is not a member of this group.");

            // Business rule: Can only transfer ownership to an admin
            if (newOwnerParticipant.Role != ChatRole.Admin)
            {
                return (false, "Ownership can only be transferred to an admin.");
            }

            currentUserParticipant.Role = ChatRole.Admin; // Demote current owner to admin
            newOwnerParticipant.Role = ChatRole.Owner;   // Promote new owner
            chat.OwnerId = newOwnerId;

            await _context.SaveChangesAsync();

            return (true, "Ownership transferred successfully.");
        }

        public async Task<(bool Success, string Message, bool WasAddedToPending)> AddMembersToGroupAsync(Guid conversationId, List<Guid> memberIds, Guid currentUserId)
        {
            var chat = await _context.Chats
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == conversationId);

            if (chat == null || !chat.IsGroup)
            {
                return (false, "Group not found.", false);
            }

            var currentUserParticipant = chat.Participants.FirstOrDefault(p => p.UserId == currentUserId);

            // Permission check: Only owner, admin, or members (if allowed) can add new members.
            bool canAdd = currentUserParticipant != null &&
                          (currentUserParticipant.Role == ChatRole.Owner || currentUserParticipant.Role == ChatRole.Admin || chat.AllowMemberInvite);

            if (!canAdd)
            {
                return (false, "You do not have permission to add members to this group.", false);
            }

            // Check if approval is required
            if (chat.RequireApproval)
            {
                foreach (var memberId in memberIds)
                {
                    if (!chat.Participants.Any(p => p.UserId == memberId))
                    {
                        _context.ChatParticipants.Add(new ChatParticipant { ChatId = conversationId, UserId = memberId, Role = ChatRole.Pending });
                    }
                }
                await _context.SaveChangesAsync();
                return (true, "Member invitations have been sent for approval.", true);
            }

            foreach (var memberId in memberIds)
            {
                if (!chat.Participants.Any(p => p.UserId == memberId))
                {
                    _context.ChatParticipants.Add(new ChatParticipant { ChatId = conversationId, UserId = memberId, Role = ChatRole.Member });
                }
            }

            await _context.SaveChangesAsync();

            // FIX: Broadcast that members have been added so clients can refresh their member lists.
            var allMemberIds = chat.Participants.Select(p => p.UserId.ToString()).ToList();
            var newMemberIdsAsStrings = memberIds.Select(id => id.ToString()).ToList();
            await _chatHubContext.Clients.Users(allMemberIds)
                .MembersAdded(new { conversationId = conversationId.ToString(), newMemberIds = newMemberIdsAsStrings });

            return (true, "Members added successfully.", false);
        }

        public async Task<(bool Success, string Message, List<string> MemberIds)> LeaveGroupAsync(Guid conversationId, Guid userId)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.", new List<string>());

            var participant = chat.Participants.FirstOrDefault(p => p.UserId == userId);
            if (participant == null) return (false, "You are not a member of this group.", new List<string>());

            if (participant.Role == ChatRole.Owner)
            {
                return (false, "Owner cannot leave the group. You must transfer ownership first.", new List<string>());
            }

            _context.ChatParticipants.Remove(participant);
            await _context.SaveChangesAsync();

            var remainingMemberIds = chat.Participants.Where(p => p.UserId != userId).Select(p => p.UserId.ToString()).ToList();
            // Also include the leaving user's ID to notify their client to remove the chat.
            var allAffectedIds = new List<string>(remainingMemberIds) { userId.ToString() };

            return (true, "Successfully left the group.", allAffectedIds);
        }

        public async Task<(bool Success, IEnumerable<GroupMemberDto> Members, string Message)> GetPendingMembersAsync(Guid conversationId, Guid userId)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, new List<GroupMemberDto>(), "Group not found.");

            var currentUserParticipant = chat.Participants.FirstOrDefault(p => p.UserId == userId);
            if (currentUserParticipant?.Role != ChatRole.Owner && currentUserParticipant?.Role != ChatRole.Admin)
            {
                return (false, new List<GroupMemberDto>(), "You do not have permission to view pending members.");
            }

            // Assuming 'Pending' status is represented by a specific role or a new status field.
            // For now, let's assume a new status field is not yet implemented and return an empty list.
            // This part needs to be connected to how pending members are stored.
            // If we assume a role like 'Pending', the query would be:
            var pendingMembers = await _context.ChatParticipants
                .Where(p => p.ChatId == conversationId && p.Role == ChatRole.Pending)
                .Include(p => p.User).ThenInclude(u => u.UserProfile)
                .Select(p => new GroupMemberDto
                {
                    Id = p.UserId.ToString(),
                    Name = (p.User!.LastName + " " + p.User!.FirstName).Trim(),
                    Avatar = p.User!.UserProfile!.Avatar,
                    Role = p.Role.ToString().ToLower(),
                    JoinedAt = p.JoinedAt
                }).ToListAsync();

            return (true, pendingMembers, "Pending members retrieved successfully.");
        }

        public async Task<(bool Success, string Message, ChatDto? NewMember, List<string> AllMemberIds)> ApprovePendingMemberAsync(Guid conversationId, Guid memberId, Guid adminId)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.", null, new List<string>());

            var adminParticipant = chat.Participants.FirstOrDefault(p => p.UserId == adminId);
            if (adminParticipant?.Role != ChatRole.Owner && adminParticipant?.Role != ChatRole.Admin)
            {
                return (false, "You do not have permission to approve members.", null, new List<string>());
            }

            var pendingParticipant = chat.Participants.FirstOrDefault(p => p.UserId == memberId && p.Role == ChatRole.Pending);
            if (pendingParticipant == null) return (false, "Pending member not found.", null, new List<string>());

            pendingParticipant.Role = ChatRole.Member; // Approve by changing role
            await _context.SaveChangesAsync();

            var newMemberUser = await _context.Users.Include(u => u.UserProfile).FirstOrDefaultAsync(u => u.Id == memberId);
            var chatDtoForNewMember = new ChatDto
            {
                Id = chat!.Id,
                Name = chat.Name,
                Avatar = chat.Avatar,
                IsGroup = true
            };

            var allMemberIds = chat.Participants.Select(p => p.UserId.ToString()).ToList();

            // FIX: Broadcast that members have been added so clients can refresh their member lists.
            await _chatHubContext.Clients.Users(allMemberIds)
                .MembersAdded(new { conversationId = conversationId.ToString(), newMemberIds = new List<string> { memberId.ToString() } });

            return (true, "Member approved.", chatDtoForNewMember, allMemberIds); // NewMember is for the user being added
        }

        public async Task<(bool Success, string Message)> RejectPendingMemberAsync(Guid conversationId, Guid memberId, Guid adminId)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.");

            var adminParticipant = chat.Participants.FirstOrDefault(p => p.UserId == adminId);
            if (adminParticipant?.Role != ChatRole.Owner && adminParticipant?.Role != ChatRole.Admin)
            {
                return (false, "You do not have permission to reject members.");
            }

            var pendingParticipant = chat.Participants.FirstOrDefault(p => p.UserId == memberId && p.Role == ChatRole.Pending);
            if (pendingParticipant == null) return (false, "Pending member not found.");

            _context.ChatParticipants.Remove(pendingParticipant);
            await _context.SaveChangesAsync();

            return (true, "Member rejected.");
        }

        public async Task<(bool Success, string Message)> UpdateGroupSettingsAsync(Guid conversationId, Guid currentUserId, GroupSettingsDto payload)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.");

            var currentUserParticipant = chat.Participants.FirstOrDefault(p => p.UserId == currentUserId);
            if (currentUserParticipant?.Role != ChatRole.Owner && currentUserParticipant?.Role != ChatRole.Admin)
            {
                return (false, "Only admins or the owner can change group settings.");
            }

            chat.RequireApproval = payload.RequireApproval;
            chat.OnlyAdminsCanSend = payload.OnlyAdminsCanSend;
            chat.AllowMemberInvite = payload.AllowMemberInvite;
            chat.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return (true, "Group settings updated successfully.");
        }

        public async Task<(bool Success, string Message, List<string> MemberIds)> DisbandGroupAsync(Guid conversationId, Guid currentUserId)
        {
            var chat = await _context.Chats.Include(c => c.Participants).FirstOrDefaultAsync(c => c.Id == conversationId);
            if (chat == null || !chat.IsGroup) return (false, "Group not found.", new List<string>());

            if (chat.OwnerId != currentUserId)
            {
                return (false, "Only the group owner can disband the group.", new List<string>());
            }

            var memberIds = chat.Participants.Select(p => p.UserId.ToString()).ToList();
            _context.Chats.Remove(chat); // This will cascade delete participants, messages, etc.
            await _context.SaveChangesAsync();

            return (true, "Group disbanded successfully.", memberIds);
        }
    }
}