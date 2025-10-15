using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    public interface IAdvancedBotTradingService
    {
        Task<string> DecideRoundOutcomeAsync(ProfitAnalysis? analysis);
        Task<bool> ExecuteTargetedManipulationAsync(string targetOutcome, decimal currentPrice, int timeRemaining, decimal startPrice);
        Task<bool> ExecuteRandomBotTradingAsync();
        Task<bool> ExecuteSingleBotTradingAsync();
        Task<List<string>> GenerateBotWalletsAsync(int count = 100);
        Task<PMCoinPriceHistory> ExecuteBotTransactionAsync(string botAddress, string action, decimal amount, string? reason = null, Guid? sessionId = null);
    }
}