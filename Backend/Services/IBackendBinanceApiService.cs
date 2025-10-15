using System.Collections.Generic;
using System.Threading.Tasks;
using TradeFinanceBackend.Models.DTOs; // Assuming a DTO for analysis exists or will be created

namespace TradeFinanceBackend.Services
{
    public interface IBackendBinanceApiService
    {
        Task<MarketAnalysisDto?> AnalyzeMarketAsync(string symbol);
    }
}
