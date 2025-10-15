using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class BlockedUser
    {
        // The user who initiated the block
        public Guid BlockerId { get; set; }
        public virtual User Blocker { get; set; } = null!;

        // The user who is being blocked
        public Guid BlockedId { get; set; }
        public virtual User Blocked { get; set; } = null!;

        public DateTime BlockedAt { get; set; } = DateTime.UtcNow;
    }
}