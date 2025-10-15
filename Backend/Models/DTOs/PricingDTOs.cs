using System.ComponentModel.DataAnnotations;

namespace TradeFinanceBackend.Models.DTOs
{
    /// <summary>
    /// DTO for token price information
    /// </summary>
    public class TokenPriceDto
    {
        public string Token { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal Change24h { get; set; }
        public DateTime LastUpdated { get; set; }
        public string Source { get; set; } = string.Empty;
    }

    /// <summary>
    /// DTO for price calculation results
    /// </summary>
    public class PriceCalculationDto
    {
        public string SellToken { get; set; } = string.Empty;
        public string BuyToken { get; set; } = string.Empty;
        public decimal SellAmount { get; set; }
        public decimal BuyAmount { get; set; }
        public decimal ExchangeRate { get; set; }
        public decimal SellTokenPrice { get; set; }
        public decimal BuyTokenPrice { get; set; }
        public DateTime CalculatedAt { get; set; }
    }

    /// <summary>
    /// DTO for price calculation request
    /// </summary>
    public class PriceCalculationRequestDto
    {
        [Required]
        [StringLength(10)]
        public string SellToken { get; set; } = string.Empty;

        [Required]
        [StringLength(10)]
        public string BuyToken { get; set; } = string.Empty;

        [Required]
        [Range(0.00000001, double.MaxValue, ErrorMessage = "Sell amount must be greater than 0")]
        public decimal SellAmount { get; set; }
    }
}
