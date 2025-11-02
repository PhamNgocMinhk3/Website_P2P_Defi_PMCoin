using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using System;
using Microsoft.Extensions.Logging;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public class BackendBinanceApiService : IBackendBinanceApiService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<BackendBinanceApiService> _logger;
        private const string BinanceApiUrl = "https://api.binance.com/api/v3";

        public BackendBinanceApiService(ILogger<BackendBinanceApiService> logger)
        {
            _httpClient = new HttpClient();
            _logger = logger;
        }

        public async Task<MarketAnalysisDto?> AnalyzeMarketAsync(string symbol)
        {
            try
            {
                var tickerTask = GetTicker24hrAsync(symbol);
                var klinesTask = GetKlinesAsync(symbol, "1h", 50);

                await Task.WhenAll(tickerTask, klinesTask);

                var tickerData = await tickerTask;
                var klineData = await klinesTask;

                if (tickerData == null || klineData == null || !klineData.Any())
                {
                    _logger.LogWarning("Could not retrieve full data for {Symbol} from Binance.", symbol);
                    return null;
                }

                return PerformTechnicalAnalysis(tickerData, klineData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error analyzing market for {Symbol}", symbol);
                return null;
            }
        }

        private async Task<BinanceTickerDto?> GetTicker24hrAsync(string symbol)
        {
            var url = $"{BinanceApiUrl}/ticker/24hr?symbol={symbol}";
            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<BinanceTickerDto>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        private async Task<List<BinanceKlineDto>?> GetKlinesAsync(string symbol, string interval, int limit)
        {
            var url = $"{BinanceApiUrl}/klines?symbol={symbol}&interval={interval}&limit={limit}";
            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            var klineRaw = JsonSerializer.Deserialize<List<object[]>>(json);
            
            return klineRaw?.Select(k => new BinanceKlineDto
            {
                OpenTime = (long)((JsonElement)k[0]).GetInt64(),
                Open = ((JsonElement)k[1]).GetString(),
                High = ((JsonElement)k[2]).GetString(),
                Low = ((JsonElement)k[3]).GetString(),
                Close = ((JsonElement)k[4]).GetString(),
            }).ToList();
        }

        private MarketAnalysisDto PerformTechnicalAnalysis(BinanceTickerDto ticker, List<BinanceKlineDto> klines)
        {
            var closes = klines.Select(k => decimal.Parse(k.Close!)).ToList();
            var highs = klines.Select(k => decimal.Parse(k.High!)).ToList();
            var lows = klines.Select(k => decimal.Parse(k.Low!)).ToList();

            var rsi = CalculateRSI(closes);
            var trend = "NEUTRAL";
            if (closes.Last() > CalculateSMA(closes, 20) && CalculateSMA(closes, 20) > CalculateSMA(closes, 50)) trend = "BULLISH";
            if (closes.Last() < CalculateSMA(closes, 20) && CalculateSMA(closes, 20) < CalculateSMA(closes, 50)) trend = "BEARISH";

            var recommendation = "HOLD";
            if (trend == "BULLISH" && rsi < 70) recommendation = "BUY";
            if (trend == "BEARISH" && rsi > 30) recommendation = "SELL";

            return new MarketAnalysisDto
            {
                Symbol = ticker.Symbol,
                CurrentPrice = decimal.Parse(ticker.LastPrice!),
                PriceChangePercent24h = decimal.Parse(ticker.PriceChangePercent!),
                Volume24h = decimal.Parse(ticker.Volume!),
                Trend = trend,
                Support = lows.Min(),
                Resistance = highs.Max(),
                Rsi = rsi,
                Recommendation = recommendation,
                Confidence = 75, // Placeholder
                Timestamp = DateTime.UtcNow
            };
        }

        private decimal CalculateSMA(List<decimal> prices, int period)
        {
            if (prices.Count < period) return prices.LastOrDefault();
            return prices.TakeLast(period).Average();
        }

        private decimal CalculateRSI(List<decimal> prices, int period = 14)
        {
            if (prices.Count < period + 1) return 50;
            var changes = prices.Skip(1).Select((p, i) => p - prices[i]).ToList();
            var gains = changes.Where(c => c > 0).ToList();
            var losses = changes.Where(c => c < 0).Select(c => -c).ToList();

            if (!gains.Any() || !losses.Any()) return 50;

            var avgGain = gains.Take(period).Average();
            var avgLoss = losses.Take(period).Average();

            for (int i = period; i < changes.Count; i++)
            {
                var change = changes[i];
                avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
                avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
            }

            if (avgLoss == 0) return 100;
            var rs = avgGain / avgLoss;
            return 100 - (100 / (1 + rs));
        }
    }
}
