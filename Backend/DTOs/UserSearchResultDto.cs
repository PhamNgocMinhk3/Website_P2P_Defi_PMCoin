namespace TradeFinanceBackend.DTOs
{
    public class UserSearchResultDto
    {
        public Guid Id { get; set; }
        public required string Username { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Avatar { get; set; }
        public bool IsOnline { get; set; }
    }
}