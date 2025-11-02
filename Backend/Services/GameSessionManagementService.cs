using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Hubs;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface IGameSessionManagementService
    {
        Task<CurrentGameSession> StartNewSessionAsync();
        Task<CurrentGameSession?> GetCurrentSessionAsync();
        Task<bool> LockBettingAsync(Guid sessionId);
        Task<bool> SettleSessionAsync(Guid sessionId);
        Task<bool> CanPlaceBetAsync(Guid sessionId);
        Task<(bool Success, string Message)> ManuallySettleSingleBetAsync(ActiveBet bet, string result);
        Task<int> GetTimeLeftAsync(Guid sessionId);
        Task NotifyPlayerActivityAsync();
    }

    public class GameSessionManagementService : BackgroundService, IGameSessionManagementService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<GameSessionManagementService> _logger;
        private readonly IHubContext<GameHub> _hubContext;

        private CurrentGameSession? _currentSession;
        private readonly int _sessionDurationSeconds = 60;
        private readonly int _bettingLockSeconds = 30;
        private readonly int _sessionGapSeconds = 2;

        private DateTime _lastPlayerActivity = DateTime.MinValue;

        public GameSessionManagementService(
            IServiceProvider serviceProvider,
            ILogger<GameSessionManagementService> logger,
            IHubContext<GameHub> hubContext)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _hubContext = hubContext;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Game Session Management Service started");
            await StartNewSessionAsync();

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    if (_currentSession != null)
                    {
                        var timeLeft = await GetTimeLeftAsync(_currentSession.Id);
                        
                        if (timeLeft <= _bettingLockSeconds && timeLeft > 0 && _currentSession.Status == GameSessionStatus.Betting)
                        {
                            await LockBettingAsync(_currentSession.Id);
                        }
                        
                        if (timeLeft <= 0 && _currentSession.Status != GameSessionStatus.Completed)
                        {
                            _logger.LogInformation("⏰ Session {SessionId} time expired - settling session", _currentSession.Id);
                            await SettleSessionAsync(_currentSession.Id);
                            
                            await Task.Delay(_sessionGapSeconds * 1000, stoppingToken);

                            await StartNewSessionAsync();
                            _logger.LogInformation("🎮 Started new session - Continuous gameplay");
                        }
                    }

                    await Task.Delay(1000, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in Game Session Management Service");
                    await Task.Delay(5000, stoppingToken);
                }
            }

            _logger.LogInformation("Game Session Management Service stopped");
        }

        public async Task<CurrentGameSession> StartNewSessionAsync()
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
                var priceService = scope.ServiceProvider.GetRequiredService<IPMCoinPriceService>();

                var currentPrice = await priceService.GetPMCoinPriceAsync();
                var startTime = DateTime.UtcNow;
                var endTime = startTime.AddSeconds(_sessionDurationSeconds);

                var session = new CurrentGameSession
                {
                    StartTime = startTime,
                    EndTime = endTime,
                    StartPrice = currentPrice,
                    CurrentPrice = currentPrice,
                    Status = GameSessionStatus.Betting,
                    TimeLeftSeconds = _sessionDurationSeconds,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                context.CurrentGameSessions.Add(session);
                await context.SaveChangesAsync();

                var analysisService = scope.ServiceProvider.GetRequiredService<IRealTimeBetAnalysisService>();
                await analysisService.CalculateProfitAnalysisAsync(session.Id);

                _currentSession = session;
                _logger.LogInformation("New game session started: {SessionId}", session.Id);

                return session;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting new game session");
                throw;
            }
        }

        public async Task<CurrentGameSession?> GetCurrentSessionAsync()
        {
            try
            {
                if (_currentSession != null && _currentSession.Status != GameSessionStatus.Completed)
                {
                    return _currentSession;
                }

                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                _currentSession = await context.CurrentGameSessions
                    .Where(s => s.Status != GameSessionStatus.Completed)
                    .OrderByDescending(s => s.CreatedAt)
                    .FirstOrDefaultAsync();

                return _currentSession;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting current session");
                return null;
            }
        }

        public async Task<bool> LockBettingAsync(Guid sessionId)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var session = await context.CurrentGameSessions.FirstOrDefaultAsync(s => s.Id == sessionId);

                if (session != null && session.Status == GameSessionStatus.Betting)
                {
                    session.Status = GameSessionStatus.Locked;
                    session.UpdatedAt = DateTime.UtcNow;
                    await context.SaveChangesAsync();

                    if (_currentSession?.Id == sessionId)
                    {
                        _currentSession.Status = GameSessionStatus.Locked;
                    }
                    return true;
                }
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error locking betting for session {SessionId}", sessionId);
                return false;
            }
        }

        public async Task<bool> SettleSessionAsync(Guid sessionId)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
                var session = await context.CurrentGameSessions.FirstOrDefaultAsync(s => s.Id == sessionId);

                if (session == null) {
                    _logger.LogWarning("Session {SessionId} not found for settlement", sessionId);
                    return false;
                }

                // CRITICAL FIX: Add a check to prevent re-entrant calls for the same session,
                // which was causing multiple payouts for a single round.
                if (session.Status == GameSessionStatus.Settling || session.Status == GameSessionStatus.Completed)
                {
                    _logger.LogWarning("Settlement for session {SessionId} is already in progress or completed. Skipping duplicate call.", sessionId);
                    return false; // Indicate that no action was taken because it's already being handled.
                }

                // 1. Notify clients that settlement is starting
                await _hubContext.Clients.Group($"GameSession_{sessionId}")
                    .SendAsync("SessionStateChanging", "SETTLING", new { sessionId = sessionId });

                session.Status = GameSessionStatus.Settling;
                // Also update the in-memory cache to prevent the background loop from re-triggering immediately.
                if (_currentSession?.Id == sessionId)
                {
                    _currentSession.Status = GameSessionStatus.Settling;
                }
                await context.SaveChangesAsync();

                var analysisService = scope.ServiceProvider.GetRequiredService<IRealTimeBetAnalysisService>();
                var botService = scope.ServiceProvider.GetRequiredService<IAdvancedBotTradingService>();
                var priceService = scope.ServiceProvider.GetRequiredService<IPMCoinPriceService>();
                var smartContractService = scope.ServiceProvider.GetRequiredService<ISmartContractService>();

                var analysis = await analysisService.GetProfitAnalysisAsync(sessionId);
                if (analysis == null)
                {
                    _logger.LogInformation("Creating profit analysis for session {SessionId}", sessionId);
                    analysis = await analysisService.CalculateProfitAnalysisAsync(sessionId);
                }

                var targetOutcome = await botService.DecideRoundOutcomeAsync(analysis);
                var currentPrice = await priceService.GetPMCoinPriceAsync();
                await botService.ExecuteTargetedManipulationAsync(targetOutcome, currentPrice, 3, session.StartPrice);

                var finalPrice = await priceService.GetPMCoinPriceAsync();
                var actualResult = finalPrice > session.StartPrice ? BetDirection.Up : finalPrice < session.StartPrice ? BetDirection.Down : "TIE";

                session.FinalPrice = finalPrice;
                session.CurrentPrice = finalPrice;
                session.Status = GameSessionStatus.Completed;
                session.UpdatedAt = DateTime.UtcNow;
                // Also update the in-memory cache.
                if (_currentSession?.Id == sessionId)
                {
                    _currentSession.Status = GameSessionStatus.Completed;
                }
                await context.SaveChangesAsync();

                // 2. Process all updates
                await UpdateDailyTargetAsync(analysis, actualResult);
                await SettleActiveBetsAsync(sessionId, actualResult, session.StartPrice, finalPrice);
                await UpdateUserStatsAsync(sessionId, actualResult);
                await UpdateSmartContractStatsAsync(analysis, actualResult);

                // FIX: Ensure daily profit is reset if a new day has started.
                await smartContractService.ResetDailyProfitIfNeededAsync();

                await CleanupSessionDataAsync(sessionId);

                // Get settled bets for this session to send to frontend
                var settledBets = await context.ActiveBets
                    .Where(b => b.SessionId == sessionId && b.IsSettled)
                    .Select(b => new TradeFinanceBackend.Models.DTOs.SettledBetDto
                    {
                        UserAddress = b.UserAddress,
                        BetAmount = b.BetAmount,
                        Direction = b.Direction,
                        Result = b.Result ?? "UNKNOWN", // Ensure Result is not null
                        PayoutAmount = b.PayoutAmount
                    })
                    .ToListAsync();

                // 3. Notify clients that session is complete with final data
                await _hubContext.Clients.Group($"GameSession_{sessionId}")
                    .SendAsync("SessionStateChanged", "COMPLETED", new {
                        sessionId = sessionId,
                        startPrice = session.StartPrice,
                        finalPrice = finalPrice,
                        result = actualResult,
                        analysis = analysis,
                        settledBets = settledBets // Include settled bets
                    });

                _logger.LogInformation("Session settled: {Result} (Target: {Target})", actualResult, targetOutcome);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error settling session {SessionId}", sessionId);
                return false;
            }
        }

        public async Task<bool> CanPlaceBetAsync(Guid sessionId)
        {
            try
            {
                var session = await GetCurrentSessionAsync();
                return session?.Id == sessionId && session.Status == GameSessionStatus.Betting;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking if bet can be placed");
                return false;
            }
        }

        public async Task<int> GetTimeLeftAsync(Guid sessionId)
        {
            try
            {
                var session = await GetCurrentSessionAsync();
                if (session?.Id != sessionId) return 0;
                var timeLeft = (int)(session.EndTime - DateTime.UtcNow).TotalSeconds;
                return Math.Max(0, timeLeft);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting time left");
                return 0;
            }
        }

        public async Task NotifyPlayerActivityAsync()
        {
            _lastPlayerActivity = DateTime.UtcNow;
            if (_currentSession == null || _currentSession.Status == GameSessionStatus.Completed)
            {
                _logger.LogInformation("🎮 Player activity detected - Starting new session");
                await StartNewSessionAsync();
            }
        }

        private async Task UpdateDailyTargetAsync(ProfitAnalysis analysis, string actualResult)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var today = DateTime.UtcNow.Date;
                var target = await context.DailyTargetTrackings.FirstOrDefaultAsync(t => t.Date.Date == today);

                if (target == null)
                {
                    target = new DailyTargetTracking
                    {
                        Date = today,
                        StartBalance = 100_000_000m,
                        CurrentBalance = 100_000_000m,
                        TargetPercentage = 0.75m,
                        TargetAmount = 750_000m,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    context.DailyTargetTrackings.Add(target);
                }

                var roundProfit = actualResult == BetDirection.Up ? analysis.UpWinProfit : actualResult == BetDirection.Down ? analysis.DownWinProfit : 0;

                target.CurrentBalance += roundProfit;
                target.AchievedAmount = target.CurrentBalance - target.StartBalance;
                target.IsTargetAchieved = target.AchievedAmount >= target.TargetAmount;
                target.TotalRounds++;
                
                if (roundProfit > 0) target.ProfitableRounds++;

                target.UpdatedAt = DateTime.UtcNow;
                await context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating daily target");
            }
        }

        private async Task UpdateUserStatsAsync(Guid sessionId, string actualResult)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                // FIX 1: Correctly filter bets for the specific session ID.
                // This was the source of the logic error that caused incorrect blacklist/whitelist behavior.
                var bets = await context.ActiveBets.Where(b => b.SessionId == sessionId).ToListAsync();

                // Handle case with no players
                if (!bets.Any())
                {
                    return;
                }

                foreach (var bet in bets)
                {
                    var userStats = await context.UserGameStats.FirstOrDefaultAsync(u => u.WalletAddress == bet.UserAddress);

                    if (userStats == null)
                    {
                        userStats = new UserGameStats { WalletAddress = bet.UserAddress, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
                        context.UserGameStats.Add(userStats);
                    }

                    // --- LOGIC CẬP NHẬT CHỈ SỐ ---
                    var userWon = (actualResult == bet.Direction);
                    var userTied = (actualResult == "TIE");

                    bool wasBlacklisted = userStats.IsBlacklisted;
                    bool wasWhitelisted = userStats.IsWhitelisted;

                    userStats.TotalBets++;
                    userStats.TotalBetAmount += bet.BetAmount;
                    userStats.LastBetTime = DateTime.UtcNow;

                    if (userWon && !userTied)
                    {
                        userStats.TotalWins++;
                        userStats.TotalWinAmount += bet.BetAmount * bet.PayoutRatio;
                        userStats.ConsecutiveWins++;
                        userStats.ConsecutiveLosses = 0;
                    }
                    else if (!userTied) // A loss
                    {
                        userStats.TotalLosses++;
                        userStats.TotalLossAmount += bet.BetAmount;
                        userStats.ConsecutiveLosses++;
                        userStats.ConsecutiveWins = 0;
                    }

                    // --- LOGIC XỬ LÝ TRẠNG THÁI (BLACKLIST/WHITELIST/COOLDOWN) ---
                    bool isOnCooldown = userStats.CooldownUntil.HasValue && userStats.CooldownUntil.Value > DateTime.UtcNow;

                    // Nếu user trong blacklist và vừa bị ép thua -> xóa blacklist, bắt đầu cooldown
                    if (wasBlacklisted && !userWon && !userTied)
                    {
                        userStats.IsBlacklisted = false;
                        userStats.BlacklistedAt = null;
                        userStats.CooldownUntil = DateTime.UtcNow.AddMinutes(15); // Cooldown 15 phút
                        _logger.LogInformation("🔄 User removed from BLACKLIST and put on cooldown: {Address}", bet.UserAddress);
                    }
                    // Nếu user trong whitelist và vừa được ép thắng -> xóa whitelist, bắt đầu cooldown
                    else if (wasWhitelisted && userWon)
                    {
                        userStats.IsWhitelisted = false;
                        userStats.WhitelistedAt = null;
                        userStats.CooldownUntil = DateTime.UtcNow.AddMinutes(15); // Cooldown 15 phút
                        _logger.LogInformation("🔄 User removed from WHITELIST and put on cooldown: {Address}", bet.UserAddress);
                    }
                    // Nếu user không thuộc danh sách nào và không trong cooldown -> kiểm tra để thêm vào
                    else if (!wasBlacklisted && !wasWhitelisted && !isOnCooldown)
                    {
                        if (userStats.ConsecutiveWins > 3) { userStats.IsBlacklisted = true; userStats.BlacklistedAt = DateTime.UtcNow; _logger.LogWarning("🚫 User BLACKLISTED: {Address} ({Wins} consecutive wins)", bet.UserAddress, userStats.ConsecutiveWins); }
                        else if (userStats.ConsecutiveLosses > 5) { userStats.IsWhitelisted = true; userStats.WhitelistedAt = DateTime.UtcNow; _logger.LogInformation("✅ User WHITELISTED: {Address} ({Losses} consecutive losses)", bet.UserAddress, userStats.ConsecutiveLosses); }
                    }

                    userStats.UpdatedAt = DateTime.UtcNow;
                }

                await context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user stats");
            }
        }

        private async Task CleanupSessionDataAsync(Guid sessionId)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                // FIX 2: Do NOT delete ActiveBet records. They are now the historical record of all bets.
                // The IsSettled flag is used to distinguish them from truly "active" bets.
                // var activeBets = await context.ActiveBets.Where(b => b.SessionId == sessionId).ToListAsync();
                // context.ActiveBets.RemoveRange(activeBets);

                var analysis = await context.ProfitAnalyses.FirstOrDefaultAsync(p => p.SessionId == sessionId);
                if (analysis != null) { context.ProfitAnalyses.Remove(analysis); }

                await context.SaveChangesAsync();
                _logger.LogInformation("Cleaned up session data for {SessionId}", sessionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cleaning up session data");
            }
        }

        private async Task SettleActiveBetsAsync(Guid sessionId, string actualResult, decimal startPrice, decimal finalPrice)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
                var signalRService = scope.ServiceProvider.GetRequiredService<ISignalRService>();

                var activeBets = await context.ActiveBets.Where(b => b.SessionId == sessionId && !b.IsSettled).ToListAsync();

                var settledCount = 0;
                var payoutFailures = 0;

                foreach (var bet in activeBets) // Lặp qua các cược trong phiên
                {
                    // CRITICAL FIX #2: Determine win/loss based on the bet's INDIVIDUAL entry price,
                    // not the session's overall result. This is the root cause of the frontend/backend mismatch.
                    bool userWon = false;
                    bool userTied = false;

                    if (finalPrice == bet.EntryPrice) {
                        userTied = true;
                    } else if (bet.Direction == BetDirection.Up) {
                        userWon = finalPrice > bet.EntryPrice;
                    } else if (bet.Direction == BetDirection.Down) {
                        userWon = finalPrice < bet.EntryPrice;
                    }
                    
                    var resultString = userWon ? "WIN" : (userTied ? "DRAW" : "LOSE");
                    var payoutAmount = userWon ? (bet.BetAmount * bet.PayoutRatio) : (userTied ? bet.BetAmount : 0);

                    // Gọi service để xử lý on-chain, chỉ nhận về transaction hash
                    var payoutService = scope.ServiceProvider.GetRequiredService<ISmartContractPayoutService>();
                    var txHash = await payoutService.ProcessPayoutAsync(bet, resultString, payoutAmount);

                    if (txHash == null) // null nghĩa là có lỗi nghiêm trọng xảy ra
                    {
                        payoutFailures++;
                        _logger.LogError("Skipping bet {BetId} due to payout processing failure.", bet.Id);
                        continue; // Bỏ qua ván cược này và xử lý ván tiếp theo
                    }

                    // Nếu mọi thứ ổn, cập nhật tất cả thông tin vào đối tượng bet trong bộ nhớ
                    bet.Result = resultString;
                    bet.PayoutAmount = payoutAmount;
                    bet.IsSettled = true;
                    bet.SettledAt = DateTime.UtcNow;
                    if (txHash != "SKIPPED_LOSE") // Không ghi hash cho trường hợp thua
                    {
                        bet.TransactionHash = txHash;
                    }

                    settledCount++;
                }

                // QUAN TRỌNG: Lưu tất cả các thay đổi (IsSettled, PayoutAmount, Result) vào database
                // trước khi các phương thức sau (như UpdateSmartContractStatsAsync) được gọi.
                await context.SaveChangesAsync();

                // CRITICAL FIX: Notifications are now handled by the frontend based on the final
                // 'SessionStateChanged' event. Sending individual notifications here creates a race
                // condition where the user sees the result before the timer hits zero.
                // The frontend's `showBetResult` function will now construct and display the
                // notification message, ensuring UI consistency.
                // await signalRService.SendNotificationToUser(bet.UserAddress, notificationMessage, notificationType);

                if (payoutFailures > 0) { _logger.LogWarning("⚠️ Session {SessionId}: {Settled} bets settled, {Failures} payout failures", sessionId, settledCount, payoutFailures); }
                else { _logger.LogInformation("✅ Session {SessionId}: {Count} bets settled successfully", sessionId, settledCount); }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error settling active bets for session {SessionId}", sessionId);
            }
        }

        public async Task<(bool Success, string Message)> ManuallySettleSingleBetAsync(ActiveBet bet, string result)
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
            var payoutService = scope.ServiceProvider.GetRequiredService<ISmartContractPayoutService>();
            var smartContractService = scope.ServiceProvider.GetRequiredService<ISmartContractService>();

            // To avoid tracking issues with the DbContext from the controller, we re-fetch the entity.
            var betToSettle = await context.ActiveBets.FindAsync(bet.Id);
            if (betToSettle == null)
            {
                _logger.LogError("Manual Settle: Bet with ID {BetId} not found.", bet.Id);
                return (false, "Bet not found in database.");
            }

            try
            {
                // 1. Calculate the correct payout amount based on the result.
                const decimal payoutRatio = 1.9m;
                decimal payoutAmount = 0;
                if (result == "WIN") payoutAmount = betToSettle.BetAmount * payoutRatio;
                else if (result == "DRAW") payoutAmount = betToSettle.BetAmount;
                
                // 2. CRITICAL FIX: Call the correct on-chain function for manual payouts.
                // Instead of using ProcessPayoutAsync (which calls resolveBet and causes the error),
                // we now directly call a service method that invokes the `manualPayout` function on the smart contract.
                // This function takes the exact amount to be paid, bypassing the faulty internal calculation.
                var payoutTxHash = await smartContractService.EmergencyPayoutAsync(payoutAmount, betToSettle.UserAddress);

                if (payoutTxHash == null)
                {
                    _logger.LogError("Manual Settle: On-chain payout process failed for Bet ID {BetId}", betToSettle.Id);
                    return (false, "On-chain payout process failed.");
                }

                // 3. Update the bet's state in the database with the correct results.
                betToSettle.Result = result;
                betToSettle.PayoutAmount = payoutAmount;
                betToSettle.IsSettled = true;
                betToSettle.SettledAt = DateTime.UtcNow;
                // Always record the transaction hash for manual settlements, even for losses (where payout is 0).
                if (payoutTxHash != null)
                {
                    betToSettle.TransactionHash = payoutTxHash;
                }
                await context.SaveChangesAsync();

                // 4. Adjust the on-chain profit stats. This remains correct: the house's profit is the bet amount minus the payout.
                decimal profitAdjustment = betToSettle.BetAmount - payoutAmount;
                var statsTxHash = await smartContractService.UpdateGameStatsWithManualPayout(profitAdjustment);
                _logger.LogInformation("Manual Settle: On-chain profit adjusted by {ProfitAdjustment}. Stats TxHash: {StatsTxHash}", profitAdjustment, statsTxHash);

                return (true, $"Bet settled. Payout Tx: {payoutTxHash}, Stats Adjustment Tx: {statsTxHash}.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during manual settlement of bet {BetId}", bet.Id);
                return (false, $"An internal error occurred: {ex.Message}");
            }
        }

        private string FormatPMAmount(decimal amount)
        {
            return amount.ToString("0.######");
        }

        private async Task UpdateSmartContractStatsAsync(ProfitAnalysis analysis, string actualResult)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
                var smartContractService = scope.ServiceProvider.GetRequiredService<ISmartContractService>();

                // CRITICAL FIX: Re-fetch the settled bets for this session to get the ACTUAL payout amounts.
                // Do NOT use the 'analysis' object, as it contains theoretical profit, not actual profit,
                // which causes a discrepancy when the bot forces a win for a whitelisted user.
                var settledBetsInSession = await context.ActiveBets
                    .Where(b => b.SessionId == analysis.SessionId && b.IsSettled)
                    .ToListAsync();

                decimal totalVolume = settledBetsInSession.Sum(b => b.BetAmount);
                decimal totalPayout = settledBetsInSession.Sum(b => b.PayoutAmount);
                decimal actualRoundProfit = totalVolume - totalPayout;

                _logger.LogInformation("📈 Updating on-chain stats -> Total Volume: {Volume}, Total Payout: {Payout}, Actual Round Profit: {Profit}", totalVolume, totalPayout, actualRoundProfit);

                var txHash = await smartContractService.UpdateGameStatsOnChainAsync(totalVolume, actualRoundProfit);

                _logger.LogInformation("✅ On-chain stats updated successfully. TxHash: {TxHash}", txHash);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating smart contract stats on-chain");
            }
        }
    }
}