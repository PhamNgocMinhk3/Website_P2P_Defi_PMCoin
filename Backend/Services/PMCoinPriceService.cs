using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace TradeFinanceBackend.Services
{
    public interface IPMCoinPriceService
    {
        Task<decimal> GetPMCoinPriceAsync();
        Task<TokenPriceDto> GetPMCoinPriceDetailAsync();
        Task<bool> UpdatePMCoinPriceAsync(decimal newPrice, string source = "MANUAL", string? reason = null, BotTransactionInfo? botInfo = null);
        Task<bool> SavePriceHistoryOnlyAsync(decimal newPrice, string source = PMCoinPriceSource.GameBot, string? reason = null);
        Task<List<PMCoinPriceHistory>> GetPriceHistoryAsync(int days = 30);
        Task<decimal> GetPriceChangeAsync(TimeSpan period);
        Task<bool> SimulateBotTradingAsync();
    }

    // DTO to carry bot transaction details
    public class BotTransactionInfo
    {
        public required string WalletAddress { get; set; }
        public required string Action { get; set; }
        public decimal Amount { get; set; }
        public decimal PriceImpact { get; set; }
    }

    public class PMCoinPriceService : IPMCoinPriceService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<PMCoinPriceService> _logger;
        private readonly IConfiguration _configuration;
        private readonly IServiceProvider _serviceProvider;
        private readonly ISignalRService _signalRService;
        
        // Cache for performance
        private static decimal? _cachedPrice;
        private static DateTime? _cacheTime;
        private static readonly TimeSpan _cacheExpiry = TimeSpan.FromSeconds(4); // Cache 4s - SYNC với bot 4s

        public PMCoinPriceService(TradeFinanceDbContext context, ILogger<PMCoinPriceService> logger, IConfiguration configuration, IServiceProvider serviceProvider, ISignalRService signalRService)
        {
            _context = context;
            _logger = logger;
            _configuration = configuration;
            _serviceProvider = serviceProvider;
            _signalRService = signalRService;

            // Remove automatic initialization to avoid concurrency issues
            // _ = Task.Run(InitializeDefaultPriceAsync);
        }

        public async Task<decimal> GetPMCoinPriceAsync()
        {
            try
            {
                if (_cachedPrice.HasValue && _cacheTime.HasValue && 
                    DateTime.UtcNow - _cacheTime.Value < _cacheExpiry)
                {
                    return _cachedPrice.Value;
                }

                // Use separate DbContext scope to avoid concurrency issues
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var latestPrice = await context.PMCoinPrices
                    .Where(p => p.IsActive)
                    .OrderByDescending(p => p.CreatedAt)
                    .FirstOrDefaultAsync();

                decimal currentPrice = latestPrice?.Price ?? 2.50m; // Default $2.50 trong range $1-5

                _cachedPrice = currentPrice;
                _cacheTime = DateTime.UtcNow;
                
                return currentPrice;
            }
            catch (Exception ex)
            {
                // Only log database errors, not connection issues
                if (ex is not InvalidOperationException && ex is not DbUpdateException)
                {
                    _logger.LogWarning("Database error fetching PM Coin price: {Error}", ex.Message);
                }
                return _cachedPrice ?? 2.50m;
            }
        }

        public async Task<TokenPriceDto> GetPMCoinPriceDetailAsync()
        {
            try
            {
                var currentPrice = await GetPMCoinPriceAsync();
                var change24h = await GetPriceChangeAsync(TimeSpan.FromHours(24));

                return new TokenPriceDto
                {
                    Token = "PM",
                    Price = currentPrice,
                    Change24h = change24h,
                    LastUpdated = DateTime.UtcNow,
                    Source = "SERVER"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching PM Coin price details");
                return new TokenPriceDto
                {
                    Token = "PM",
                    Price = _cachedPrice ?? 2.50m,
                    Change24h = 0,
                    LastUpdated = DateTime.UtcNow,
                    Source = "ERROR"
                };
            }
        }

        public async Task<bool> UpdatePMCoinPriceAsync(decimal newPrice, string source = "MANUAL", string? reason = null, BotTransactionInfo? botInfo = null)
        {
            try
            {
                // QUAN TRỌNG: Đảm bảo giá trong range $1-5
                if (newPrice < 1m)
                {
                    _logger.LogWarning("Attempted to set price below minimum: {Price}. Setting to minimum $1.00", newPrice);
                    newPrice = 1m; // Giá tối thiểu $1.00
                }
                else if (newPrice > 5m)
                {
                    _logger.LogWarning("Attempted to set price above maximum: {Price}. Setting to maximum $5.00", newPrice);
                    newPrice = 5m; // Giá tối đa $5.00
                }

                var oldPrice = await GetPMCoinPriceAsync();

                // 🎯 SMOOTH TRANSITION với giới hạn để tránh overflow
                if (Math.Abs(newPrice - oldPrice) < 100m) // Chỉ smooth nếu thay đổi < $100
                {
                    await CreateSmoothPriceTransitionAsync(oldPrice, newPrice, source, reason);
                }

                var change = newPrice - oldPrice;
                var changePercent = oldPrice > 0 ? (change / oldPrice) * 100 : 0;

                // QUAN TRỌNG: Giới hạn changePercent để tránh overflow (decimal(5,2) max = 999.99)
                changePercent = Math.Max(-999.99m, Math.Min(999.99m, changePercent));

                // Tìm record active hiện tại hoặc tạo mới nếu chưa có
                var currentPriceRecord = await _context.PMCoinPrices
                    .Where(p => p.IsActive)
                    .FirstOrDefaultAsync();

                if (currentPriceRecord != null)
                {
                    // Update record hiện tại
                    currentPriceRecord.Price = newPrice;
                    currentPriceRecord.Change24h = await GetPriceChangeAsync(TimeSpan.FromHours(24));
                    currentPriceRecord.ChangePercent24h = changePercent;
                    currentPriceRecord.Volume24h = 0;
                    currentPriceRecord.MarketCap = newPrice * 1_000_000m;
                    currentPriceRecord.Source = source;
                    currentPriceRecord.Reason = reason;
                    currentPriceRecord.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    // Tạo record đầu tiên
                    var priceRecord = new PMCoinPrice
                    {
                        Price = newPrice,
                        Change24h = await GetPriceChangeAsync(TimeSpan.FromHours(24)),
                        ChangePercent24h = changePercent,
                        Volume24h = 0,
                        MarketCap = newPrice * 1_000_000m,
                        Source = source,
                        Reason = reason,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    _context.PMCoinPrices.Add(priceRecord);
                }

                // Only save to history if significant change (> 0.1%) or every 5 minutes
                var lastHistory = await _context.PMCoinPriceHistories
                    .OrderByDescending(h => h.Timestamp)
                    .FirstOrDefaultAsync();

                bool shouldSaveHistory = Math.Abs(changePercent) > 0.1m || // Significant change
                    lastHistory == null || // First record
                    DateTime.UtcNow - lastHistory.Timestamp > TimeSpan.FromMinutes(5); // Time-based

                if (shouldSaveHistory)
                {
                    var historyRecord = new PMCoinPriceHistory
                    {
                        Price = newPrice,
                        PreviousPrice = oldPrice,
                        Change = change,
                        ChangePercent = changePercent,
                        Source = source,
                        Reason = reason,
                        Timestamp = DateTime.UtcNow,
                        Date = DateTime.UtcNow.Date,
                        Hour = DateTime.UtcNow.Hour,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    if (botInfo != null && source == PMCoinPriceSource.GameBot)
                    {
                        historyRecord.BotWalletAddress = botInfo.WalletAddress;
                        historyRecord.BotAction = botInfo.Action;
                        historyRecord.BotAmount = botInfo.Amount;
                        historyRecord.PriceImpact = botInfo.PriceImpact;
                    }

                    _context.PMCoinPriceHistories.Add(historyRecord);
                }
                await _context.SaveChangesAsync();

                // Clear cache để force refresh
                _cachedPrice = null;
                _cacheTime = null;

                // 🚀 REALTIME: Broadcast price update via SignalR
                try
                {
                    var priceDetail = await GetPMCoinPriceDetailAsync();
                    await _signalRService.BroadcastPriceUpdate(priceDetail);
                    _logger.LogDebug("📡 Broadcasted price update: ${Price}", newPrice);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "❌ Error broadcasting price update via SignalR");
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating PM Coin price to {Price}", newPrice);
                return false;
            }
        }

        public async Task<List<PMCoinPriceHistory>> GetPriceHistoryAsync(int days = 30)
        {
            try
            {
                var cutoffDate = DateTime.UtcNow.AddDays(-days);
                return await _context.PMCoinPriceHistories
                    .Where(h => h.Timestamp >= cutoffDate)
                    .OrderBy(h => h.Timestamp)
                    .ToListAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching PM Coin price history");
                return new List<PMCoinPriceHistory>();
            }
        }

        public async Task<decimal> GetPriceChangeAsync(TimeSpan period)
        {
            try
            {
                // Use separate DbContext scope to avoid concurrency issues
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var cutoffTime = DateTime.UtcNow - period;
                var oldPrice = await context.PMCoinPriceHistories
                    .Where(h => h.Timestamp >= cutoffTime)
                    .OrderBy(h => h.Timestamp)
                    .Select(h => h.Price)
                    .FirstOrDefaultAsync();

                if (oldPrice > 0)
                {
                    var currentPrice = await GetPMCoinPriceAsync();
                    return currentPrice - oldPrice;
                }

                return 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating price change");
                return 0;
            }
        }

        // 🎯 SMOOTH DATA: Tạo intermediate price steps để tránh jump quá lớn
        private async Task CreateSmoothPriceTransitionAsync(decimal fromPrice, decimal toPrice, string source, string? reason)
        {
            try
            {
                var priceDiff = Math.Abs(toPrice - fromPrice);

                // Nếu thay đổi > $0.5, tạo intermediate steps
                if (priceDiff > 0.5m)
                {
                    var steps = Math.Min(5, (int)(priceDiff / 0.1m)); // Tối đa 5 steps
                    var stepSize = (toPrice - fromPrice) / steps;

                    for (int i = 1; i < steps; i++)
                    {
                        var intermediatePrice = fromPrice + (stepSize * i);

                        // Tạo history record (không active)
                        var historyRecord = new PMCoinPriceHistory
                        {
                            Price = intermediatePrice,
                            PreviousPrice = fromPrice,
                            Change = intermediatePrice - fromPrice,
                            ChangePercent = fromPrice > 0 ? ((intermediatePrice - fromPrice) / fromPrice) * 100 : 0,
                            Source = source + "_SMOOTH",
                            Reason = reason + " (smooth transition)",
                            Timestamp = DateTime.UtcNow.AddSeconds(-steps + i) // Backdate để tạo timeline
                        };

                        _context.PMCoinPriceHistories.Add(historyRecord);
                    }

                    await _context.SaveChangesAsync();
                    _logger.LogInformation($"📈 Created {steps-1} smooth transition steps from ${fromPrice:F3} to ${toPrice:F3}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating smooth price transition");
            }
        }

        public async Task<bool> SimulateBotTradingAsync()
        {
            try
            {
                var random = new Random();

                // 🚨 FORCE CLEAR CACHE để lấy giá thật từ DB
                _cachedPrice = null;
                _cacheTime = null;

                var currentPrice = await GetPMCoinPriceAsync();

                // 🎯 EMERGENCY RESET: Nếu giá > $50 thì reset về $10
                if (currentPrice > 50m)
                {
                    _logger.LogWarning("🚨 EMERGENCY RESET: Price ${Price} too high. Resetting to $10", currentPrice);

                    // DIRECT DATABASE UPDATE để bypass cache
                    using var scope = _serviceProvider.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                    var priceRecord = await context.PMCoinPrices
                        .Where(p => p.IsActive)
                        .FirstOrDefaultAsync();

                    if (priceRecord != null)
                    {
                        priceRecord.Price = 10m;
                        priceRecord.UpdatedAt = DateTime.UtcNow;
                        await context.SaveChangesAsync();

                        _cachedPrice = 10m;
                        _cacheTime = DateTime.UtcNow;

                        _logger.LogInformation("✅ Price reset to $10 successfully");
                        return true;
                    }
                }

                // 🎯 CHỈ THAO TÚNG KHI CÓ USER: Check active users trước
                var hasActiveUsers = await HasActiveUsersAsync();
                if (!hasActiveUsers)
                {
                    // Không có user → Random hoàn toàn
                    var pureRandom = random.NextDouble();
                    if (pureRandom < 0.7) return true; // 70% skip để giá ổn định

                    // 30% random nhẹ trong range $1-5
                    var randomChange = (decimal)(random.NextDouble() * 0.4 - 0.2); // ±$0.2
                    var newPriceRandom = Math.Max(1m, Math.Min(5m, currentPrice + randomChange));

                    // 🎯 ROUND TO 2 DECIMAL PLACES để tránh database overflow
                    newPriceRandom = Math.Round(newPriceRandom, 2);

                    if (Math.Abs(newPriceRandom - currentPrice) > 0.01m)
                    {
                        return await UpdatePMCoinPriceAsync(newPriceRandom, PMCoinPriceSource.GameBot, "Random Market Movement");
                    }
                    return true;
                }

                // 🎲 CÓ USER → THAO TÚNG: 40% giảm, 40% tăng, 20% không đổi
                var action = random.NextDouble();
                decimal newPrice;
                string reason;

                if (action < 0.4) // 40% - GIẢM GIÁ
                {
                    // 🎯 GIẢM BIẾN ĐỘNG: Chỉ ±$0.1-0.5 trong range $1-5
                    var decrease = (decimal)(random.NextDouble() * 0.4 + 0.1); // -$0.1 đến -$0.5
                    newPrice = currentPrice - decrease;
                    reason = "Bot Sell";
                    var botInfo = new BotTransactionInfo
                    {
                        WalletAddress = $"Bot#{random.Next(1, 100)}",
                        Action = "SELL",
                        Amount = Math.Abs(newPrice - currentPrice) * 10000m, // Mock amount
                        PriceImpact = newPrice - currentPrice
                    };

                    _logger.LogDebug("📉 Bot Sell: ${CurrentPrice} → ${NewPrice} (-${Decrease})",
                        currentPrice, newPrice, decrease);

                    // Đảm bảo giá trong range $1-5
                    newPrice = Math.Max(1m, newPrice);
                    // 🎯 ROUND TO 2 DECIMAL PLACES để tránh database overflow
                    newPrice = Math.Round(newPrice, 2);

                    if (Math.Abs(newPrice - currentPrice) > 0.01m)
                    {
                        return await UpdatePMCoinPriceAsync(newPrice, PMCoinPriceSource.GameBot, reason, botInfo);
                    }
                    return true;
                }
                else if (action < 0.8) // 40% - TĂNG GIÁ
                {
                    // 🎯 GIẢM BIẾN ĐỘNG: Chỉ ±$0.1-0.5 trong range $1-5
                    var increase = (decimal)(random.NextDouble() * 0.4 + 0.1); // +$0.1 đến +$0.5
                    newPrice = currentPrice + increase;
                    reason = "Bot Buy";
                    var botInfo = new BotTransactionInfo
                    {
                        WalletAddress = $"Bot#{random.Next(1, 100)}",
                        Action = "BUY",
                        Amount = Math.Abs(newPrice - currentPrice) * 10000m, // Mock amount
                        PriceImpact = newPrice - currentPrice
                    };

                    _logger.LogDebug("📈 Bot Buy: ${CurrentPrice} → ${NewPrice} (+${Increase})",
                        currentPrice, newPrice, increase);

                    // Đảm bảo giá trong range $1-5
                    newPrice = Math.Min(5m, newPrice);
                    // 🎯 ROUND TO 2 DECIMAL PLACES để tránh database overflow
                    newPrice = Math.Round(newPrice, 2);

                    if (Math.Abs(newPrice - currentPrice) > 0.01m)
                    {
                        return await UpdatePMCoinPriceAsync(newPrice, PMCoinPriceSource.GameBot, reason, botInfo);
                    }
                    return true;
                }
                else // 20% - KHÔNG ĐỔI
                {
                    return true; // Skip update
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error simulating bot trading");
                return false;
            }
        }

        private async Task<bool> HasActiveUsersAsync()
        {
            try
            {
                // Check if có user nào login trong 10 phút qua
                var tenMinutesAgo = DateTime.UtcNow.AddMinutes(-10);
                var activeUsers = await _context.Users
                    .Where(u => u.LastLoginAt.HasValue && u.LastLoginAt > tenMinutesAgo)
                    .CountAsync();

                return activeUsers > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking active users");
                return false; // Default to no manipulation
            }
        }

        private async Task InitializeDefaultPriceAsync()
        {
            try
            {
                var hasAnyPrice = await _context.PMCoinPrices.AnyAsync();
                
                if (!hasAnyPrice)
                {
                    var defaultPrice = _configuration.GetValue<decimal?>("PMCoin:DefaultPrice") ?? 2.50m;
                    await UpdatePMCoinPriceAsync(defaultPrice, PMCoinPriceSource.System, "Initial setup");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error initializing PM Coin price");
            }
        }

        // Method để bot chỉ lưu history, KHÔNG update PMCoinPrices
        public async Task<bool> SavePriceHistoryOnlyAsync(decimal newPrice, string source = PMCoinPriceSource.GameBot, string? reason = null)
        {
            try
            {
                var oldPrice = await GetPMCoinPriceAsync();
                var change = newPrice - oldPrice;
                var changePercent = oldPrice > 0 ? (change / oldPrice) * 100 : 0;

                var historyRecord = new PMCoinPriceHistory
                {
                    Price = newPrice,
                    PreviousPrice = oldPrice,
                    Change = change,
                    ChangePercent = changePercent,
                    Source = source,
                    Reason = reason,
                    Timestamp = DateTime.UtcNow,
                    Date = DateTime.UtcNow.Date,
                    Hour = DateTime.UtcNow.Hour,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.PMCoinPriceHistories.Add(historyRecord);
                await _context.SaveChangesAsync();

                _logger.LogInformation($"💾 Bot saved price history: ${newPrice:F3} ({change:+0.000;-0.000}) - {reason}");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving PM Coin price history for bot");
                return false;
            }
        }
    }
}
