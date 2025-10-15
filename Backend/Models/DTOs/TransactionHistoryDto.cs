namespace TradeFinanceBackend.Models.DTOs
{
    public class TransactionHistoryDto
    {
        public Guid Id { get; set; }
        public string TxHash { get; set; } = string.Empty;
        public string SellToken { get; set; } = string.Empty;
        public string BuyToken { get; set; } = string.Empty;
        public decimal SellAmount { get; set; }
        public decimal BuyAmount { get; set; }
        public string SellerAddress { get; set; } = string.Empty;
        public string? BuyerAddress { get; set; }
        public string Status { get; set; } = string.Empty;
        public string TransactionType { get; set; } = string.Empty;
        public long? BlockNumber { get; set; }
        public decimal? GasUsed { get; set; }
        public decimal? GasFee { get; set; }
        public DateTimeOffset TransactionTime { get; set; }
        public string? Notes { get; set; }
    }

    public class SaveTransactionHistoryDto
    {
        public string TxHash { get; set; } = string.Empty;
        public string SellToken { get; set; } = string.Empty;
        public string BuyToken { get; set; } = string.Empty;
        public decimal SellAmount { get; set; }
        public decimal BuyAmount { get; set; }
        public string SellerAddress { get; set; } = string.Empty;
        public string? BuyerAddress { get; set; }
        public string Status { get; set; } = string.Empty;
        public long? BlockNumber { get; set; }
        public decimal? GasUsed { get; set; }
        public DateTimeOffset TransactionTime { get; set; } = DateTimeOffset.UtcNow;
    }
}