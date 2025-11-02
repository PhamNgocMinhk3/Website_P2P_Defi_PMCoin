using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Hubs
{
    public interface IChatClient
    {
        Task ReceiveMessage(MessageDto message);
        Task MessageDeleted(object payload);
        Task ReactionToggled(object payload);
        Task PollUpdated(object payload);
        Task AppointmentUpdated(object payload);
        Task UserBlocked(object payload);
        Task UserUnblocked(object payload);
        Task MembersAdded(object payload);
        Task MemberKicked(object payload);
        Task MemberLeft(object payload);
        Task AddedToGroup(ChatDto newConversation);
        Task GroupSettingsUpdated(object payload);
        Task GroupDisbanded(object payload);
        Task MemberRoleChanged(object payload);
        Task ConversationDeleted(object payload);
        // Call signaling
        Task IncomingCall(object payload);
        Task CallAccepted(object payload);
        Task CallRejected(object payload);
        Task CallEnded(object payload);
    }
}