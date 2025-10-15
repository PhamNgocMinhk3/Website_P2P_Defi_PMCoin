using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class SharedLink : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid ChatId { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [MaxLength(2000)]
        public string Url { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? Title { get; set; }

        [MaxLength(1000)]
        public string? Description { get; set; }

        [MaxLength(500)]
        public string? ImageUrl { get; set; }

        public bool IsUnsafe { get; set; } = false;

        // Navigation properties
        [ForeignKey("ChatId")]
        public virtual Chat Chat { get; set; } = null!;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public class PinnedMessage : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid MessageId { get; set; }

        [Required]
        public Guid ChatId { get; set; }

        [Required]
        public Guid PinnedBy { get; set; }

        public DateTime PinnedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        [ForeignKey("MessageId")]
        public virtual Message Message { get; set; } = null!;

        [ForeignKey("ChatId")]
        public virtual Chat Chat { get; set; } = null!;

        [ForeignKey("PinnedBy")]
        public virtual User PinnedByUser { get; set; } = null!;
    }
}
