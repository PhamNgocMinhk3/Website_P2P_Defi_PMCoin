using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class PMCoinPrice : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal Price { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal Change24h { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal ChangePercent24h { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal Volume24h { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal MarketCap { get; set; }

        [Required]
        [MaxLength(50)]
        public string Source { get; set; } = "GAME_BOT"; // GAME_BOT, MANUAL, UP_DOWN_GAME

        [MaxLength(100)]
        public string? Reason { get; set; } // Bot action, Game result, Manual update

        public bool IsActive { get; set; } = true;
    }

    public class PMCoinPriceHistory : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        [Column(TypeName = "decimal(18,8)")]
        public decimal Price { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal PreviousPrice { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal Change { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal ChangePercent { get; set; }

        [Required]
        [MaxLength(50)]
        public string Source { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Reason { get; set; }

        [Required]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        // For indexing and fast queries
        [Required]
        public DateTime Date { get; set; } = DateTime.UtcNow.Date;

        [Required]
        public int Hour { get; set; } = DateTime.UtcNow.Hour;

        // Bot transaction details (if caused by bot)
        [MaxLength(42)]
        public string? BotWalletAddress { get; set; }

        [MaxLength(10)]
        public string? BotAction { get; set; } // BUY, SELL

        [Column(TypeName = "decimal(18,8)")]
        public decimal? BotAmount { get; set; }

        [Column(TypeName = "decimal(18,8)")]
        public decimal? PriceImpact { get; set; }

        public Guid? SessionId { get; set; }
    }

    public static class PMCoinPriceSource
    {
        public const string GameBot = "GAME_BOT";
        public const string Manual = "MANUAL";
        public const string UpDownGame = "UP_DOWN_GAME";
        public const string P2PTrade = "P2P_TRADE";
        public const string System = "SYSTEM";
    }
}
