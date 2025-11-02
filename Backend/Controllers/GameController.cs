using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GameController : ControllerBase
    {
        private readonly IGameSessionManagementService _sessionService;
        private readonly IRealTimeBetAnalysisService _analysisService;
        private readonly IAdvancedBotTradingService _botService;
        private readonly IPMCoinPriceService _priceService;
        private readonly IOnDemandBotService _onDemandBotService;
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<GameController> _logger;

        public GameController(
            IGameSessionManagementService sessionService,
            IRealTimeBetAnalysisService analysisService,
            IAdvancedBotTradingService botService,
            IPMCoinPriceService priceService,
            IOnDemandBotService onDemandBotService,
            TradeFinanceDbContext context,
            ILogger<GameController> logger)
        {
            _sessionService = sessionService;
            _analysisService = analysisService;
            _botService = botService;
            _priceService = priceService;
            _onDemandBotService = onDemandBotService;
            _context = context;
            _logger = logger;
        }

        // Get current game session info
        [HttpGet("current-session")]
        public async Task<IActionResult> GetCurrentSession()
        {
            try
            {
                // FIX: Get the absolute latest session directly from the database,
                // including 'COMPLETED' ones. This ensures the frontend polling
                // always gets the result of the last round.
                var session = await _context.CurrentGameSessions
                    .OrderByDescending(s => s.CreatedAt)
                    .FirstOrDefaultAsync();

                if (session == null)
                {
                    // This is a valid state if the server has just started.
                    // Return a 404 so the frontend knows there's no session yet.
                    return NotFound(new { message = "No session found in history." });
                }

                // FIX: Return the exact state of the session as it was saved in the database.
                // Do not recalculate timeLeft or currentPrice here to ensure data consistency
                // between what the backend processed and what the frontend receives.
                return Ok(new
                {
                    sessionId = session.Id,
                    startTime = session.StartTime,
                    endTime = session.EndTime,
                    startPrice = session.StartPrice,
                    currentPrice = session.CurrentPrice, // Use the saved current price
                    finalPrice = session.FinalPrice,
                    status = session.Status.ToString(),
                    timeLeft = session.TimeLeftSeconds // Use the saved timeLeft
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting current session");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get the state of the absolute latest session, including completed ones.
        // This is crucial for the frontend to correctly display the results of the previous round.
        [HttpGet("latest-session-state")]
        public async Task<IActionResult> GetLatestSessionState()
        {
            try
            {
                var session = await _context.CurrentGameSessions
                    .OrderByDescending(s => s.CreatedAt)
                    .FirstOrDefaultAsync();

                if (session == null)
                {
                    return NotFound(new { message = "No session found in history." });
                }

                var timeLeft = (int)(session.EndTime - DateTime.UtcNow).TotalSeconds;
                var currentPrice = await _priceService.GetPMCoinPriceAsync();

                return Ok(new
                {
                    sessionId = session.Id,
                    startTime = session.StartTime,
                    endTime = session.EndTime,
                    startPrice = session.StartPrice,
                    currentPrice = currentPrice,
                    finalPrice = session.FinalPrice,
                    status = session.Status.ToString(),
                    timeLeft = Math.Max(0, timeLeft)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting latest session state");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get PM coin price history for chart
        [HttpGet("pm-price-history")]
        public async Task<IActionResult> GetPMPriceHistory([FromQuery] string timeRange = "1h")
        {
            try
            {
                var days = timeRange switch
                {
                    "1h" => 1,
                    "4h" => 1,
                    "1d" => 7,
                    _ => 1
                };

                var history = await _priceService.GetPriceHistoryAsync(days);
                _logger.LogInformation("📊 PM Price History: Found {Count} records for {Days} days", history?.Count ?? 0, days);

                // If no history data, generate sample data
                if (history == null || !history.Any())
                {
                    _logger.LogWarning("⚠️ No PM price history found, generating sample data");
                    var currentPrice = await _priceService.GetPMCoinPriceAsync();
                    var sampleData = GenerateSampleCandlestickData(currentPrice);
                    return Ok(sampleData);
                }

                // Group by time intervals and create OHLC data from real history
                var candlestickData = history
                    .GroupBy(h => new DateTime(h.Timestamp.Year, h.Timestamp.Month, h.Timestamp.Day, h.Timestamp.Hour, 0, 0))
                    .Select(g => new
                    {
                        time = ((DateTimeOffset)g.Key).ToUnixTimeSeconds(),
                        open = g.First().Price,
                        high = g.Max(x => x.Price),
                        low = g.Min(x => x.Price),
                        close = g.Last().Price,
                        volume = 1000 + new Random().Next(0, 5000) // Mock volume
                    })
                    .OrderBy(x => x.time)
                    .ToList();

                return Ok(candlestickData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting PM price history");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get PM coin price histories from PMCoinPriceHistories table
        [HttpGet("pmcoin-price-histories")]
        public async Task<IActionResult> GetPMCoinPriceHistories([FromQuery] int hours = 24)
        {
            try
            {
                var days = Math.Max(1, hours / 24); // Convert hours to days, minimum 1 day
                var history = await _priceService.GetPriceHistoryAsync(days);
                _logger.LogInformation("📊 PMCoin Price Histories: Found {Count} records for {Hours} hours", history?.Count ?? 0, hours);

                // If no history data, generate sample data
                if (history == null || !history.Any())
                {
                    _logger.LogWarning("⚠️ No PMCoin price history found, generating sample data");
                    var currentPrice = await _priceService.GetPMCoinPriceAsync();
                    var sampleData = GenerateSampleCandlestickData(currentPrice);
                    return Ok(sampleData);
                }

                // Filter by hours and create OHLC data from real history
                var cutoffTime = DateTime.UtcNow.AddHours(-hours);
                var filteredHistory = history.Where(h => h.Timestamp >= cutoffTime).ToList();

                var candlestickData = filteredHistory
                    .GroupBy(h => new DateTime(h.Timestamp.Year, h.Timestamp.Month, h.Timestamp.Day, h.Timestamp.Hour, 0, 0))
                    .Select(g => new
                    {
                        time = ((DateTimeOffset)g.Key).ToUnixTimeSeconds(),
                        open = g.First().Price,
                        high = g.Max(x => x.Price),
                        low = g.Min(x => x.Price),
                        close = g.Last().Price,
                        volume = 1000 + new Random().Next(0, 5000) // Mock volume
                    })
                    .OrderBy(x => x.time)
                    .ToList();

                return Ok(candlestickData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting PMCoin price histories");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        private List<object> GenerateSampleCandlestickData(decimal basePrice)
        {
            var data = new List<object>();
            var random = new Random();
            var currentTime = DateTimeOffset.UtcNow.AddHours(-24); // Start 24 hours ago
            var currentPrice = basePrice;

            for (int i = 0; i < 24; i++)
            {
                var open = currentPrice;
                var change = (decimal)(random.NextDouble() - 0.5) * 0.1m; // ±5% change (more visible)
                var high = open + Math.Abs(change) + (decimal)random.NextDouble() * 0.05m;
                var low = open - Math.Abs(change) - (decimal)random.NextDouble() * 0.05m;
                var close = open + change;

                // Ensure prices are positive and reasonable (min $0.01)
                var minPrice = 0.01m;
                if (high <= minPrice) high = Math.Max(open * 1.01m, minPrice);
                if (low <= minPrice) low = Math.Max(open * 0.99m, minPrice);
                if (close <= minPrice) close = Math.Max(open, minPrice);

                data.Add(new
                {
                    time = currentTime.ToUnixTimeSeconds(),
                    open = Math.Round(Math.Max(0.0001m, open), 6),
                    high = Math.Round(Math.Max(0.0001m, high), 6),
                    low = Math.Round(Math.Max(0.0001m, low), 6),
                    close = Math.Round(Math.Max(0.0001m, close), 6),
                    volume = 1000 + random.Next(0, 5000)
                });

                currentPrice = close;
                currentTime = currentTime.AddHours(1);
            }

            return data;
        }

        // Get recent bot transactions for credibility
        [HttpGet("bot-transactions")]
        public async Task<IActionResult> GetBotTransactions([FromQuery] int limit = 50)
        {
            try
            {
                // Query từ PMCoinPriceHistory thay vì BotTransactionHistories
                var transactions = await _context.PMCoinPriceHistories
                    .Where(h => h.BotWalletAddress != null) // Chỉ lấy records có bot transaction
                    .OrderByDescending(h => h.Timestamp)
                    .Take(Math.Min(limit, 100)) // Max 100 records
                    .ToListAsync();

                var response = transactions.Select(t => new
                {
                    botAddress = t.BotWalletAddress,
                    action = t.BotAction,
                    amount = t.BotAmount,
                    price = t.Price,
                    priceImpact = t.PriceImpact,
                    timestamp = t.Timestamp,
                    change = t.Change,
                    changePercent = t.ChangePercent
                }).ToList();

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting bot transactions");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Manual bot trading trigger (for testing)
        [HttpPost("trigger-bot-trading")]
        public async Task<IActionResult> TriggerBotTrading()
        {
            try
            {
                var success = await _botService.ExecuteRandomBotTradingAsync();
                return Ok(new { success = success, message = "Bot trading executed" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error triggering bot trading");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Start bot when user enters game page
        [HttpPost("start-bot")]
        public async Task<IActionResult> StartBot([FromBody] StartBotRequest request)
        {
            try
            {
                await _onDemandBotService.StartBotForUserAsync(request.UserAddress);
                var activeBots = await _onDemandBotService.GetActiveBotCount();

                // 🎮 Notify có người chơi để start session
                await _sessionService.NotifyPlayerActivityAsync();

                return Ok(new {
                    success = true,
                    message = "Bot started for user",
                    activeBots = activeBots
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting bot for user: {UserAddress}", request.UserAddress);
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Place bet endpoint
        [HttpPost("bet")]
        public async Task<IActionResult> PlaceBet([FromBody] PlaceBetRequest request)
        {
            try
            {
                // Get current session
                var currentSession = await _context.CurrentGameSessions
                    .Where(s => !s.IsCompleted)
                    .OrderByDescending(s => s.StartTime)
                    .FirstOrDefaultAsync();

                if (currentSession == null)
                {
                    return BadRequest(new { message = "No active game session" });
                }

                // CRITICAL FIX: Get the most up-to-date price at the moment the bet is placed. The old logic used `currentSession.CurrentPrice`, 
                // which was the price at the *start* of the session, causing a major discrepancy between the frontend's entry price 
                // and the backend's, leading to incorrect win/loss outcomes.
                var entryPrice = await _priceService.GetPMCoinPriceAsync();

                // Create active bet record
                var activeBet = new ActiveBet
                {
                    SessionId = currentSession.Id,
                    ContractBetId = request.ContractBetId,
                    UserAddress = request.UserAddress,
                    BetAmount = (decimal)request.Amount,
                    Direction = request.Direction.ToUpper(), // Ensure direction is uppercase
                    EntryPrice = entryPrice, // Use the real-time price for accurate win/loss settlement
                    CreatedAt = DateTime.UtcNow
                };

                _context.ActiveBets.Add(activeBet);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Bet placed: {Amount} PM {Direction} from {User}",
                    request.Amount, request.Direction, request.UserAddress);

                return Ok(new {
                    success = true,
                    betId = activeBet.Id,
                    sessionId = currentSession.Id,
                    startPrice = currentSession.StartPrice,
                    timeLeft = (int)(currentSession.EndTime - DateTime.UtcNow).TotalSeconds
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error placing bet for user: {UserAddress}", request.UserAddress);
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Stop bot when user leaves game page
        [HttpPost("stop-bot")]
        public async Task<IActionResult> StopBot([FromBody] StopBotRequest request)
        {
            try
            {
                await _onDemandBotService.StopBotForUserAsync(request.UserAddress);
                var activeBots = await _onDemandBotService.GetActiveBotCount();
                
                return Ok(new { 
                    success = true, 
                    message = "Bot stopped for user",
                    activeBots = activeBots
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping bot for user: {UserAddress}", request.UserAddress);
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get bot status
        [HttpGet("bot-status")]
        public async Task<IActionResult> GetBotStatus([FromQuery] string userAddress)
        {
            try
            {
                var isRunning = _onDemandBotService.IsBotRunningForUser(userAddress);
                var activeBots = await _onDemandBotService.GetActiveBotCount();

                return Ok(new {
                    isRunning = isRunning,
                    activeBots = activeBots
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting bot status for user: {UserAddress}", userAddress);
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get current daily target
        [HttpGet("daily-target")]
        public async Task<IActionResult> GetDailyTarget()
        {
            try
            {
                var today = DateTime.UtcNow.Date;
                var target = await _context.DailyTargetTrackings
                    .FirstOrDefaultAsync(t => t.Date.Date == today);

                if (target == null)
                {
                    // Create new daily target if not exists
                    target = new DailyTargetTracking
                    {
                        Date = today,
                        StartBalance = 100_000_000m, // 100M PM
                        CurrentBalance = 100_000_000m,
                        TargetPercentage = 0.75m, // 0.75%
                        TargetAmount = 750_000m, // 750K PM
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    _context.DailyTargetTrackings.Add(target);
                    await _context.SaveChangesAsync();
                }

                // Calculate progress percentage
                var progressPercentage = target.TargetAmount > 0
                    ? (double)(target.AchievedAmount / target.TargetAmount) * 100
                    : 0;

                // Calculate game session statistics for today
                var todayStart = DateTime.UtcNow.Date;
                var todayEnd = todayStart.AddDays(1);

                var todaySessions = await _context.CurrentGameSessions
                    .Where(s => s.StartTime >= todayStart && s.StartTime < todayEnd && s.IsCompleted)
                    .ToListAsync();

                var totalRounds = todaySessions.Count;
                var profitableRounds = todaySessions.Count(s => s.HouseProfit > 0);
                var winRate = totalRounds > 0 ? (double)profitableRounds / totalRounds * 100 : 0.0;

                return Ok(new
                {
                    date = target.Date.ToString("yyyy-MM-dd"),
                    startBalance = target.StartBalance,
                    currentBalance = target.CurrentBalance,
                    targetPercentage = target.TargetPercentage,
                    targetAmount = target.TargetAmount,
                    achievedAmount = target.AchievedAmount,
                    isTargetAchieved = target.IsTargetAchieved,
                    progressPercentage = Math.Round(progressPercentage, 2),
                    totalRounds = totalRounds,
                    profitableRounds = profitableRounds,
                    winRate = Math.Round(winRate, 2)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting daily target");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get active bets for a session
        [HttpGet("active-bets/{sessionId}")]
        public async Task<IActionResult> GetActiveBets(string sessionId)
        {
            try
            {
                var activeBets = await _context.ActiveBets
                    .Where(b => b.SessionId.ToString() == sessionId && !b.IsSettled)
                    .Select(b => new
                    {
                        betId = b.Id,
                        userAddress = b.UserAddress,
                        amount = b.Amount,
                        direction = b.Direction,
                        createdAt = b.CreatedAt,
                        entryPrice = b.EntryPrice
                    })
                    .ToListAsync();

                return Ok(new { activeBets });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting active bets for session: {SessionId}", sessionId);
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get profit analysis for a session
        [HttpGet("profit-analysis/{sessionId}")]
        public async Task<IActionResult> GetProfitAnalysis(string sessionId)
        {
            try
            {
                var sessionBets = await _context.ActiveBets
                    .Where(b => b.SessionId.ToString() == sessionId && b.IsSettled)
                    .ToListAsync();

                var totalTrades = sessionBets.Count;
                var profitableTrades = sessionBets.Count(b => b.PayoutAmount > b.Amount);
                var totalProfit = sessionBets.Where(b => b.PayoutAmount > b.Amount).Sum(b => b.PayoutAmount - b.Amount);
                var totalLoss = sessionBets.Where(b => b.PayoutAmount <= b.Amount).Sum(b => b.Amount - b.PayoutAmount);
                var netProfit = totalProfit - totalLoss;
                var winRate = totalTrades > 0 ? (double)profitableTrades / totalTrades * 100 : 0.0;
                var averageProfit = profitableTrades > 0 ? totalProfit / profitableTrades : 0m;
                var averageLoss = (totalTrades - profitableTrades) > 0 ? totalLoss / (totalTrades - profitableTrades) : 0m;
                var maxProfit = sessionBets.Any() ? sessionBets.Max(b => b.PayoutAmount - b.Amount) : 0m;
                var maxLoss = sessionBets.Any() ? sessionBets.Min(b => b.PayoutAmount - b.Amount) : 0m;

                return Ok(new
                {
                    totalProfit = Math.Round(totalProfit, 2),
                    totalLoss = Math.Round(totalLoss, 2),
                    netProfit = Math.Round(netProfit, 2),
                    winRate = Math.Round(winRate, 2),
                    totalTrades,
                    profitableTrades,
                    averageProfit = Math.Round(averageProfit, 2),
                    averageLoss = Math.Round(averageLoss, 2),
                    maxProfit = Math.Round(maxProfit, 2),
                    maxLoss = Math.Round(maxLoss, 2)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting profit analysis for session: {SessionId}", sessionId);
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get blacklisted users
        [HttpGet("blacklisted-users")]
        public async Task<IActionResult> GetBlacklistedUsers()
        {
            try
            {
                var blacklistedUsers = await _context.UserGameStats
                    .Where(u => u.IsBlacklisted)
                    .Select(u => new
                    {
                        address = u.WalletAddress,
                        consecutiveWins = u.ConsecutiveWins,
                        consecutiveLosses = u.ConsecutiveLosses,
                        status = "Force Lose",
                        isBlacklisted = u.IsBlacklisted,
                        isWhitelisted = u.IsWhitelisted,
                        blacklistedAt = u.BlacklistedAt
                    })
                    .ToListAsync();

                return Ok(blacklistedUsers);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting blacklisted users");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

        // Get whitelisted users
        [HttpGet("whitelisted-users")]
        public async Task<IActionResult> GetWhitelistedUsers()
        {
            try
            {
                var whitelistedUsers = await _context.UserGameStats
                    .Where(u => u.IsWhitelisted)
                    .Select(u => new
                    {
                        address = u.WalletAddress,
                        consecutiveWins = u.ConsecutiveWins,
                        consecutiveLosses = u.ConsecutiveLosses,
                        status = "Force Win",
                        isBlacklisted = u.IsBlacklisted,
                        isWhitelisted = u.IsWhitelisted,
                        whitelistedAt = u.WhitelistedAt
                    })
                    .ToListAsync();

                return Ok(whitelistedUsers);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting whitelisted users");
                return StatusCode(500, new { message = "Internal server error" });
            }
        }

    }

    // DTOs for requests
    public class StartBotRequest
    {
        public string UserAddress { get; set; } = string.Empty;
    }

    public class PlaceBetRequest
    {
        public string UserAddress { get; set; } = string.Empty;
        public string Direction { get; set; } = string.Empty; // UP or DOWN
        public double Amount { get; set; }
        public long ContractBetId { get; set; } // Thêm ContractBetId vào request
    }

    public class StopBotRequest
    {
        public string UserAddress { get; set; } = string.Empty;
    }
}
