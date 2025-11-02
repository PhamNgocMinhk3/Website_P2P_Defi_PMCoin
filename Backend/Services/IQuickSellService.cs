using System.Threading.Tasks;
using System.Collections.Generic;
using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    public interface IQuickSellService
    {
        Task<QuickSellContractStatus> GetContractStatusAsync();
        Task<string> DepositVNDTAsync(decimal amount);
        Task<string> WithdrawTokensAsync(string tokenSymbol);
        Task<Dictionary<string, decimal>> GetExchangeRatesAsync();
        Task<string> SetExchangeRateAsync(string tokenSymbol, decimal? manualRate = null);
    }

    public class QuickSellContractStatus
    {
        public Dictionary<string, decimal> Balances { get; set; } = new Dictionary<string, decimal>();
    }
}