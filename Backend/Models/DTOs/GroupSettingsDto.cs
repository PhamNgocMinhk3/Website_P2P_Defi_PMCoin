namespace TradeFinanceBackend.Models.DTOs
{
    public class GroupSettingsDto
    {
        public bool RequireApproval { get; set; }
        public bool OnlyAdminsCanSend { get; set; }
        public bool AllowMemberInvite { get; set; }
    }
}
