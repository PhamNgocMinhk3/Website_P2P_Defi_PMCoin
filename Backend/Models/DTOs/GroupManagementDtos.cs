namespace TradeFinanceBackend.Models.DTOs
{
    /// <summary>
    /// DTO for updating a member's role in a group.
    /// </summary>
    public class UpdateRoleDto
    {
        public string Role { get; set; } = string.Empty;
    }

    /// <summary>
    /// DTO for transferring ownership of a group.
    /// </summary>
    public class TransferOwnershipDto
    {
        public Guid NewOwnerId { get; set; }
    }
}