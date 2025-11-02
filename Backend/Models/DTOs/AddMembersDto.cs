namespace TradeFinanceBackend.Models.DTOs
{
    public class AddMembersDto
    {
        public List<Guid> MemberIds { get; set; } = new List<Guid>();
    }
}