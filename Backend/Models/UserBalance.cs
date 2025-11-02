using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class UserBalance : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [MaxLength(42)]
        public string WalletAddress { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        public string TokenSymbol { get; set; } = "PM"; // PM, BTC, etc.

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal Balance { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal LockedBalance { get; set; } = 0; // For pending bets

        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

        // Navigation property
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public class BalanceTransaction : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [MaxLength(42)]
        public string WalletAddress { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        public string TokenSymbol { get; set; } = "PM";

        [Required]
        [MaxLength(20)]
        public string TransactionType { get; set; } = string.Empty; // DEPOSIT, WITHDRAWAL, BET_PAYOUT, BET_DEDUCT

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal Amount { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal BalanceBefore { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal BalanceAfter { get; set; }

        [MaxLength(100)]
        public string? Description { get; set; }

        [MaxLength(66)]
        public string? TransactionHash { get; set; }

        public Guid? RelatedBetId { get; set; } // Link to ActiveBet if related to betting

        // Navigation properties
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }

    public static class BalanceTransactionType
    {
        public const string Deposit = "DEPOSIT";
        public const string Withdrawal = "WITHDRAWAL";
        public const string BetPayout = "BET_PAYOUT";
        public const string BetDeduct = "BET_DEDUCT";
        public const string BetRefund = "BET_REFUND";
    }
}