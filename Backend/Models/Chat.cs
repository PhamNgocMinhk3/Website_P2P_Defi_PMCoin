using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class Chat : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [MaxLength(255)]
        public string? Name { get; set; }

        [MaxLength(500)]
        public string? Avatar { get; set; }

        public bool IsGroup { get; set; } = false;

        public Guid? OwnerId { get; set; }

        public bool RequireApproval { get; set; } = false;
        public bool OnlyAdminsCanSend { get; set; } = false;
        public bool AllowMemberInvite { get; set; } = false;

        // Navigation properties
        [ForeignKey("OwnerId")]
        public virtual User? Owner { get; set; }
        
        public virtual ICollection<ChatParticipant> Participants { get; set; } = [];
        public virtual ICollection<Message> Messages { get; set; } = [];
    }

    public class ChatParticipant : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid ChatId { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [MaxLength(100)]
        public string? Nickname { get; set; }

        public ChatRole Role { get; set; } = ChatRole.Member;

        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

        public DateTime? MutedUntil { get; set; }
        
        [MaxLength(7)]
        public string? ThemeColor { get; set; }

        [MaxLength(500)]
        public string? ThemeBackgroundUrl { get; set; }


        // Navigation properties
        [ForeignKey("ChatId")]
        public virtual Chat Chat { get; set; } = null!;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public enum ChatRole
    {
        Member = 0,
        Admin = 1,
        Owner = 2,
        Pending = 3
    }
}