using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class TransactionHistory : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [MaxLength(66)]
        public string TxHash { get; set; } = string.Empty; // Blockchain transaction hash

        [Required]
        [MaxLength(10)]
        public string SellToken { get; set; } = string.Empty; // BTC, ETH, PM, VND

        [Required]
        [MaxLength(10)]
        public string BuyToken { get; set; } = string.Empty; // BTC, ETH, PM, VND

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal SellAmount { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal BuyAmount { get; set; }

        [Required]
        [MaxLength(42)]
        public string SellerAddress { get; set; } = string.Empty; // Seller's wallet address

        [MaxLength(42)]
        public string? BuyerAddress { get; set; } // Buyer's wallet address (null for create order)

        [Required]
        [MaxLength(20)]
        public string Status { get; set; } = TransactionStatus.Created; // CREATED, MATCHED, COMPLETED, CANCELLED

        [Required]
        [MaxLength(20)]
        public string TransactionType { get; set; } = "CREATE_ORDER"; // CREATE_ORDER, MATCH_ORDER, CANCEL_ORDER

        public long? BlockNumber { get; set; } // Blockchain block number

        [Column(TypeName = "decimal(18,8)")]
        public decimal? GasUsed { get; set; } // Gas used for transaction

        [Column(TypeName = "decimal(18,8)")]
        public decimal? GasFee { get; set; } // Gas fee paid

        [Required]
        public DateTime TransactionTime { get; set; } = DateTime.UtcNow; // When transaction occurred

        [MaxLength(500)]
        public string? Notes { get; set; } // Additional notes or error messages

        // Navigation property
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public static class TransactionStatus
    {
        public const string Created = "CREATED";
        public const string Matched = "MATCHED";
        public const string Completed = "COMPLETED";
        public const string Cancelled = "CANCELLED";
        public const string Failed = "FAILED";
    }

    public static class TransactionType
    {
        public const string CreateOrder = "CREATE_ORDER";
        public const string MatchOrder = "MATCH_ORDER";
        public const string CancelOrder = "CANCEL_ORDER";
        public const string CompleteOrder = "COMPLETE_ORDER";
    }
}
