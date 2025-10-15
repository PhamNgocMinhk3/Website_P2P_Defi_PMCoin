using TradeFinanceBackend.Models;
using TradeFinanceBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace TradeFinanceBackend.Services
{
    public interface IRealTimeBetAnalysisService
    {
        Task<ProfitAnalysis> CalculateProfitAnalysisAsync(Guid sessionId);
        Task<ProfitAnalysis> AddBetAndRecalculateAsync(Guid sessionId, ActiveBet bet);
        Task<ProfitAnalysis?> GetProfitAnalysisAsync(Guid sessionId);
        Task<bool> UpdateProfitAnalysisAsync(ProfitAnalysis analysis);
    }

    public class RealTimeBetAnalysisService : IRealTimeBetAnalysisService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<RealTimeBetAnalysisService> _logger;
        private readonly decimal _payoutRatio = 1.9m;

        public RealTimeBetAnalysisService(
            IServiceProvider serviceProvider,
            ILogger<RealTimeBetAnalysisService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        // Calculate profit for each outcome
        public async Task<ProfitAnalysis> CalculateProfitAnalysisAsync(Guid sessionId)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var bets = await context.ActiveBets
                    .Where(b => b.SessionId == sessionId)
                    .ToListAsync();

                decimal totalUpBets = 0;
                decimal totalDownBets = 0;

                foreach (var bet in bets)
                {
                    if (bet.Direction == BetDirection.Up)
                    {
                        totalUpBets += bet.BetAmount;
                    }
                    else if (bet.Direction == BetDirection.Down)
                    {
                        totalDownBets += bet.BetAmount;
                    }
                }

                // Calculate house profit for each outcome
                // Payout ratio includes the original stake, so the actual profit/loss is based on (_payoutRatio - 1)
                decimal profitRatio = _payoutRatio - 1; // This will be 0.9m

                // UP wins: house gets all DOWN bets, pays winnings to UP bets
                var upWinProfit = totalDownBets - (totalUpBets * profitRatio);

                // DOWN wins: house gets all UP bets, pays winnings to DOWN bets
                var downWinProfit = totalUpBets - (totalDownBets * profitRatio);

                var analysis = new ProfitAnalysis
                {
                    SessionId = sessionId,
                    TotalUpBets = totalUpBets,
                    TotalDownBets = totalDownBets,
                    UpWinProfit = upWinProfit,
                    DownWinProfit = downWinProfit,
                    RecommendedOutcome = upWinProfit > downWinProfit ? BetDirection.Up : BetDirection.Down,
                    ManipulationNeeded = Math.Max(upWinProfit, downWinProfit) > 0,
                    TotalBetCount = bets.Count,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Reduced logging - only log when there are actual bets
                if (bets.Count > 0)
                {
                    _logger.LogInformation("Profit analysis: UP={UpBets}({UpProfit}), DOWN={DownBets}({DownProfit})",
                        totalUpBets, upWinProfit, totalDownBets, downWinProfit);
                }

                return analysis;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating profit analysis for session {SessionId}", sessionId);
                throw;
            }
        }

        // Add new bet and recalculate
        public async Task<ProfitAnalysis> AddBetAndRecalculateAsync(Guid sessionId, ActiveBet bet)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                // Add the bet
                context.ActiveBets.Add(bet);
                await context.SaveChangesAsync();

                // Recalculate profit analysis
                var analysis = await CalculateProfitAnalysisAsync(sessionId);

                // Save or update profit analysis
                var existingAnalysis = await context.ProfitAnalyses
                    .FirstOrDefaultAsync(p => p.SessionId == sessionId);

                if (existingAnalysis != null)
                {
                    // Update existing
                    existingAnalysis.TotalUpBets = analysis.TotalUpBets;
                    existingAnalysis.TotalDownBets = analysis.TotalDownBets;
                    existingAnalysis.UpWinProfit = analysis.UpWinProfit;
                    existingAnalysis.DownWinProfit = analysis.DownWinProfit;
                    existingAnalysis.RecommendedOutcome = analysis.RecommendedOutcome;
                    existingAnalysis.ManipulationNeeded = analysis.ManipulationNeeded;
                    existingAnalysis.TotalBetCount = analysis.TotalBetCount;
                    existingAnalysis.UpdatedAt = DateTime.UtcNow;

                    context.ProfitAnalyses.Update(existingAnalysis);
                    analysis = existingAnalysis;
                }
                else
                {
                    // Create new
                    context.ProfitAnalyses.Add(analysis);
                }

                await context.SaveChangesAsync();

                // Reduced logging - only log significant bets
                if (bet.BetAmount >= 100) // Only log bets >= $100
                {
                    _logger.LogInformation("New bet: {Direction} ${Amount}", bet.Direction, bet.BetAmount);
                }

                return analysis;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding bet and recalculating for session {SessionId}", sessionId);
                throw;
            }
        }

        // Get existing profit analysis
        public async Task<ProfitAnalysis?> GetProfitAnalysisAsync(Guid sessionId)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                return await context.ProfitAnalyses
                    .FirstOrDefaultAsync(p => p.SessionId == sessionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting profit analysis for session {SessionId}", sessionId);
                return null;
            }
        }

        // Update profit analysis
        public async Task<bool> UpdateProfitAnalysisAsync(ProfitAnalysis analysis)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                analysis.UpdatedAt = DateTime.UtcNow;
                context.ProfitAnalyses.Update(analysis);
                await context.SaveChangesAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating profit analysis");
                return false;
            }
        }
    }

    // DTO for API responses
    public class ProfitAnalysisDto
    {
        public Guid SessionId { get; set; }
        public decimal TotalUpBets { get; set; }
        public decimal TotalDownBets { get; set; }
        public decimal UpWinProfit { get; set; }
        public decimal DownWinProfit { get; set; }
        public string? RecommendedOutcome { get; set; }
        public bool ManipulationNeeded { get; set; }
        public int TotalBetCount { get; set; }
        public DateTimeOffset? UpdatedAt { get; set; }
        
        // Additional calculated fields
        public decimal TotalBetVolume => TotalUpBets + TotalDownBets;
        public decimal BetRatio => TotalDownBets > 0 ? TotalUpBets / TotalDownBets : 0;
        public string BetDistribution => $"UP: {TotalUpBets:F2} ({(TotalBetVolume > 0 ? (TotalUpBets / TotalBetVolume * 100):0):F1}%) | DOWN: {TotalDownBets:F2} ({(TotalBetVolume > 0 ? (TotalDownBets / TotalBetVolume * 100):0):F1}%)";
        public decimal MaxProfit => Math.Max(UpWinProfit, DownWinProfit);
        public decimal MinProfit => Math.Min(UpWinProfit, DownWinProfit);
        public string ProfitSummary => $"Best: {MaxProfit:F2} | Worst: {MinProfit:F2}";
    }

    // Extension methods for easy conversion
    public static class ProfitAnalysisExtensions
    {
        public static ProfitAnalysisDto ToDto(this ProfitAnalysis analysis)
        {
            return new ProfitAnalysisDto
            {
                SessionId = analysis.SessionId,
                TotalUpBets = analysis.TotalUpBets,
                TotalDownBets = analysis.TotalDownBets,
                UpWinProfit = analysis.UpWinProfit,
                DownWinProfit = analysis.DownWinProfit,
                RecommendedOutcome = analysis.RecommendedOutcome,
                ManipulationNeeded = analysis.ManipulationNeeded,
                TotalBetCount = analysis.TotalBetCount,
                UpdatedAt = analysis.UpdatedAt
            };
        }
    }
}