using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class LoginHistory : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [MaxLength(45)]
        public string IpAddress { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? UserAgent { get; set; }

        [MaxLength(100)]
        public string? Location { get; set; }

        [MaxLength(100)]
        public string? Device { get; set; }

        public bool IsSuccessful { get; set; } = true;

        [MaxLength(500)]
        public string? FailureReason { get; set; }

        public DateTime LoginTime { get; set; } = DateTime.UtcNow;

        // Navigation property
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }
}