using System.Text.Json;
using System.Text.Json.Serialization;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface IBinancePriceService
    {
        Task<decimal> GetTokenPriceAsync(string token);
        Task<Dictionary<string, decimal>> GetMultipleTokenPricesAsync(string[] tokens);
        Task<TokenPriceDto> GetTokenPriceDetailAsync(string token);
        Task<bool> IsServiceAvailableAsync();
    }

    public class BinancePriceService : IBinancePriceService, IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<BinancePriceService> _logger;
        private readonly Dictionary<string, decimal> _priceCache = new();
        private readonly Dictionary<string, DateTime> _cacheTimestamps = new();
        private readonly TimeSpan _cacheExpiry = TimeSpan.FromMinutes(1); // Cache for 1 minute
        private readonly object _cacheLock = new(); // Thread safety lock
        private readonly SemaphoreSlim _requestSemaphore = new(3, 3); // Limit concurrent requests

        // Binance symbol mapping
        private readonly Dictionary<string, string> _symbolMapping = new()
        {
            { "BTC", "BTCUSDT" },
            { "ETH", "ETHUSDT" },
            { "VND", "USDTVND" } // Special case - we'll calculate VND from USDT
        };

        public BinancePriceService(HttpClient httpClient, ILogger<BinancePriceService> logger)
        {
            _httpClient = httpClient;
            _logger = logger;
            
            // Configure HttpClient for Binance API
            _httpClient.BaseAddress = new Uri("https://api.binance.com/");
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "DATK-P2P-Trading/1.0");
        }

        public async Task<decimal> GetTokenPriceAsync(string token)
        {
            try
            {
                token = token.ToUpper();

                // Check cache first (thread-safe)
                lock (_cacheLock)
                {
                    if (_priceCache.ContainsKey(token) &&
                        _cacheTimestamps.ContainsKey(token) &&
                        DateTime.UtcNow - _cacheTimestamps[token] < _cacheExpiry)
                    {
                        return _priceCache[token];
                    }
                }

                decimal price = 0;

                if (token == "VND")
                {
                    // Special handling for VND - get USDT price and convert
                    price = await GetVNDPriceAsync();
                }
                else if (_symbolMapping.ContainsKey(token))
                {
                    var symbol = _symbolMapping[token];
                    price = await FetchBinancePriceAsync(symbol);
                }
                else
                {
                    _logger.LogWarning("Unsupported token for price fetch: {Token}", token);
                    return 0;
                }

                // Update cache safely
                lock (_cacheLock)
                {
                    _priceCache[token] = price;
                    _cacheTimestamps[token] = DateTime.UtcNow;
                }

                return price;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching price for token: {Token}", token);
                return 0;
            }
        }

        public async Task<Dictionary<string, decimal>> GetMultipleTokenPricesAsync(string[] tokens)
        {
            var prices = new Dictionary<string, decimal>();
            var tasks = tokens.Select(async token =>
            {
                var price = await GetTokenPriceAsync(token);
                return new { Token = token.ToUpper(), Price = price };
            });

            var results = await Task.WhenAll(tasks);
            
            foreach (var result in results)
            {
                prices[result.Token] = result.Price;
            }

            return prices;
        }

        public async Task<TokenPriceDto> GetTokenPriceDetailAsync(string token)
        {
            try
            {
                token = token.ToUpper();
                var price = await GetTokenPriceAsync(token);
                
                // For now, we don't fetch 24h change from Binance to keep it simple
                // This can be enhanced later
                return new TokenPriceDto
                {
                    Token = token,
                    Price = price,
                    Change24h = 0, // TODO: Implement 24h change calculation
                    LastUpdated = DateTime.UtcNow,
                    Source = "BINANCE"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching detailed price for token: {Token}", token);
                return new TokenPriceDto
                {
                    Token = token,
                    Price = 0,
                    Change24h = 0,
                    LastUpdated = DateTime.UtcNow,
                    Source = "ERROR"
                };
            }
        }

        public async Task<bool> IsServiceAvailableAsync()
        {
            try
            {
                var response = await _httpClient.GetAsync("api/v3/ping");
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        private async Task<decimal> FetchBinancePriceAsync(string symbol)
        {
            await _requestSemaphore.WaitAsync();
            try
            {
                var response = await _httpClient.GetAsync($"api/v3/ticker/price?symbol={symbol}");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                var priceData = JsonSerializer.Deserialize<BinancePriceResponse>(content);

                // Check if we have valid data
                if (priceData?.Price != null)
                {
                    // Try to parse the price
                    if (decimal.TryParse(priceData.Price, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var price))
                    {
                        if (price > 0)
                        {
                            // Success! Return the price
                            _logger.LogDebug("Successfully fetched price for {Symbol}: ${Price}", symbol, price);
                            return price;
                        }
                        else
                        {
                            _logger.LogWarning("Price is zero or negative for symbol: {Symbol}. Price: {Price}", symbol, price);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Failed to parse price for symbol: {Symbol}. Price string: {PriceString}", symbol, priceData.Price);
                    }
                }
                else
                {
                    _logger.LogWarning("Price data is null for symbol: {Symbol}. Full response: {Content}", symbol, content);
                }

                // If price is not valid, return 0
                return 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching Binance price for symbol: {Symbol}", symbol);
                return 0;
            }
            finally
            {
                _requestSemaphore.Release();
            }
        }

        private async Task<decimal> GetVNDPriceAsync()
        {
            try
            {
                // VND is typically around 24,000-26,000 VND per USD
                // For demo purposes, we'll use a fixed rate
                // In production, you'd fetch this from a forex API
                await Task.Delay(10); // Simulate async operation
                return 26000m; // 1 USD = 26,000 VND
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating VND price");
                return 26000m; // Fallback rate
            }
        }

        private class BinancePriceResponse
        {
            [JsonPropertyName("symbol")]
            public string? Symbol { get; set; }

            [JsonPropertyName("price")]
            public string? Price { get; set; }
        }

        public void Dispose()
        {
            _requestSemaphore?.Dispose();
        }
    }
}
