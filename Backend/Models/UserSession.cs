using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class UserSession
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [MaxLength(255)]
        public string SessionToken { get; set; } = string.Empty;

        [Required]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Required]
        public DateTime ExpiryDate { get; set; }

        public DateTime? LastAccessedAt { get; set; }

        [MaxLength(45)]
        public string? IpAddress { get; set; }

        [MaxLength(500)]
        public string? UserAgent { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime? RevokedAt { get; set; }

        [MaxLength(255)]
        public string? RevokedReason { get; set; }

        public bool IsExpired => DateTime.UtcNow >= ExpiryDate;
        public bool IsValid => IsActive && !IsExpired && RevokedAt == null;

        // Navigation property
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }
}
