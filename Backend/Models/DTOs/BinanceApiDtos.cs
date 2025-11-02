using System.Collections.Generic;

namespace TradeFinanceBackend.Models.DTOs
{
    // DTO for data from Binance /api/v3/ticker/24hr
    public class BinanceTickerDto
    {
        public string? Symbol { get; set; }
        public string? LastPrice { get; set; }
        public string? PriceChange { get; set; }
        public string? PriceChangePercent { get; set; }
        public string? Volume { get; set; }
    }

    // DTO for data from Binance /api/v3/klines
    public class BinanceKlineDto
    {
        public long OpenTime { get; set; }
        public string? Open { get; set; }
        public string? High { get; set; }
        public string? Low { get; set; }
        public string? Close { get; set; }
    }

    // DTO for the final analysis result, similar to frontend
    public class MarketAnalysisDto
    {
        public string? Symbol { get; set; }
        public decimal CurrentPrice { get; set; }
        public decimal PriceChangePercent24h { get; set; }
        public decimal Volume24h { get; set; }
        public string? Trend { get; set; }
        public decimal Support { get; set; }
        public decimal Resistance { get; set; }
        public decimal Rsi { get; set; }
        public string? Recommendation { get; set; }
        public double Confidence { get; set; }
        public System.DateTime Timestamp { get; set; }
    }
}
