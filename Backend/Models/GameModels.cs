using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    // Current Game Session (25s rounds)
    public class CurrentGameSession : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public DateTime StartTime { get; set; }

        [Required]
        public DateTime EndTime { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal StartPrice { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal CurrentPrice { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal? FinalPrice { get; set; }

        [Required]
        [MaxLength(20)]
        public string Status { get; set; } = GameSessionStatus.Betting; // BETTING, LOCKED, SETTLING, COMPLETED

        public int TimeLeftSeconds { get; set; }

        public bool IsCompleted { get; set; } = false;

        [Column(TypeName = "decimal(18,8)")]
        public decimal HouseProfit { get; set; } = 0;

        // Navigation properties
        public virtual ICollection<ActiveBet> ActiveBets { get; set; } = new List<ActiveBet>();
        public virtual ProfitAnalysis? ProfitAnalysis { get; set; }
    }

    // Active Bets in Current Session
    public class ActiveBet : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid SessionId { get; set; }

        [Required]
        [MaxLength(42)]
        public string UserAddress { get; set; } = string.Empty;

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal BetAmount { get; set; }

        [Required]
        [MaxLength(10)]
        public string Direction { get; set; } = string.Empty; // UP, DOWN

        [Column(TypeName = "decimal(5,2)")]
        public decimal PayoutRatio { get; set; } = 1.9m;

        public bool IsSettled { get; set; } = false;

        [Column(TypeName = "decimal(18,8)")]
        public decimal Amount { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal EntryPrice { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal PayoutAmount { get; set; } = 0;

        [MaxLength(10)]
        public string? Result { get; set; } // WIN, LOSE, DRAW

        public DateTime? SettledAt { get; set; }

        // Smart Contract Integration
        public long? ContractBetId { get; set; } // Bet ID from smart contract

        [MaxLength(66)]
        public string? TransactionHash { get; set; } // Transaction hash when bet was placed

        // Navigation properties
        public virtual CurrentGameSession Session { get; set; } = null!;
    }

    // Real-time Profit Analysis
    public class ProfitAnalysis : BaseEntity
    {
        [Key]
        public Guid SessionId { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal TotalUpBets { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal TotalDownBets { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal UpWinProfit { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal DownWinProfit { get; set; } = 0;

        [MaxLength(10)]
        public string? RecommendedOutcome { get; set; } // UP, DOWN

        public bool ManipulationNeeded { get; set; } = false;

        public int TotalBetCount { get; set; } = 0;

        // Navigation properties
        public virtual CurrentGameSession Session { get; set; } = null!;
    }

    // Daily Target Tracking
    public class DailyTargetTracking : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public DateTime Date { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal StartBalance { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal CurrentBalance { get; set; }

        [Required]
        [Column(TypeName = "decimal(5,2)")]
        public decimal TargetPercentage { get; set; } // 0.5-1%

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal TargetAmount { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal AchievedAmount { get; set; } = 0;

        public bool IsTargetAchieved { get; set; } = false;

        public int TotalRounds { get; set; } = 0;
        public int ProfitableRounds { get; set; } = 0;
    }

    // ❌ DEPRECATED: BotTransactionHistory đã được merge vào PMCoinPriceHistory
    // Giữ lại class này để tránh breaking changes, nhưng không sử dụng nữa
    [Obsolete("Use PMCoinPriceHistory instead. This class is kept for backward compatibility only.")]
    public class BotTransactionHistory : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        [MaxLength(42)]
        public string BotWalletAddress { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        public string Action { get; set; } = string.Empty; // BUY, SELL

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal Amount { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal Price { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal PriceImpact { get; set; }

        [Required]
        public DateTime Timestamp { get; set; }

        [MaxLength(100)]
        public string? Reason { get; set; } // Target manipulation, Random trading, etc.

        public Guid? SessionId { get; set; } // Link to game session if manipulation

        // Navigation properties
        public virtual CurrentGameSession? Session { get; set; }
    }

    // User Game Stats (for blacklist/whitelist)
    public class UserGameStats : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        [MaxLength(42)]
        public string WalletAddress { get; set; } = string.Empty;

        public int ConsecutiveWins { get; set; } = 0;
        public int ConsecutiveLosses { get; set; } = 0;
        public int TotalBets { get; set; } = 0;
        public int TotalWins { get; set; } = 0;
        public int TotalLosses { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal TotalBetAmount { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal TotalWinAmount { get; set; } = 0;

        [Column(TypeName = "decimal(18,8)")]
        public decimal TotalLossAmount { get; set; } = 0;

        public bool IsBlacklisted { get; set; } = false; // >4 consecutive wins
        public bool IsWhitelisted { get; set; } = false; // >7 consecutive losses

        public DateTime? LastBetTime { get; set; }
        public DateTime? BlacklistedAt { get; set; }
        public DateTime? WhitelistedAt { get; set; }

        public DateTime? CooldownUntil { get; set; }
    }

    // Static classes for constants
    public static class GameSessionStatus
    {
        public const string Betting = "BETTING";
        public const string Locked = "LOCKED";
        public const string Settling = "SETTLING";
        public const string Completed = "COMPLETED";
    }

    public static class BetDirection
    {
        public const string Up = "UP";
        public const string Down = "DOWN";
    }

    public static class BotAction
    {
        public const string Buy = "BUY";
        public const string Sell = "SELL";
    }
}
