using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class SmartContractLog : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string EventType { get; set; } = string.Empty;

        [Required]
        [MaxLength(66)]
        public string TransactionHash { get; set; } = string.Empty;

        [Required]
        public long BlockNumber { get; set; }

        [Required]
        [MaxLength(42)]
        public string FromAddress { get; set; } = string.Empty;

        [Required]
        [MaxLength(42)]
        public string ToAddress { get; set; } = string.Empty;

        [Column(TypeName = "decimal(18,8)")]
        public decimal Amount { get; set; }

        [Column(TypeName = "text")]
        public string? EventData { get; set; } // JSON data của event

        [Required]
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;

        [Required]
        public DateTime Date { get; set; } = DateTime.UtcNow.Date;

        [Required]
        public int Hour { get; set; } = DateTime.UtcNow.Hour;
    }
}
